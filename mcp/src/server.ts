import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createServer } from "http"
import { Server as SocketIOServer, type Socket } from "socket.io"
import { nanoid } from "nanoid"
import { z } from "zod"
import { exec } from "child_process"
import { platform } from "os"
import {
  appendFile,
  mkdir,
  writeFile,
  unlink,
  readdir,
  readFile,
} from "fs/promises"
import { unlinkSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const LOG_DIR = join(homedir(), ".handle")
const LOG_FILE = join(LOG_DIR, "handle.log")
const SESSIONS_DIR = join(LOG_DIR, "sessions")

await mkdir(SESSIONS_DIR, { recursive: true })

function log(entry: Record<string, unknown>) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  })
  appendFile(LOG_FILE, line + "\n").catch(() => {})
}

const sessionId = nanoid()
const sessionFile = join(SESSIONS_DIR, `${sessionId}.json`)
console.error(`[mcp] session ${sessionId}`)

const DISCOVERY_PORT = 58932
const PROGRESS_INTERVAL_MS = 5_000
// How long we wait after the extension disconnects before declaring the live
// session over. Allows for page reloads and brief network flakes.
const GRACE_PERIOD_MS = Number(process.env.HANDLE_GRACE_PERIOD_MS ?? 8_000)

type ExitReason = "user_stopped" | "extension_closed" | "interrupted"

type SessionEvent =
  | { type: "feedback"; content: string }
  | { type: "exit"; reason: ExitReason }

interface SessionState {
  id: string
  agentName: string
  repo: string
  context: string | undefined
  queue: SessionEvent[]
  pendingResolve: ((event: SessionEvent) => void) | null
  graceTimer: NodeJS.Timeout | null
  ended: boolean
}

let sessionState: SessionState | null = null

const ROOM = `session:${sessionId}`

// Socket.IO setup — bind to port 0 for OS-assigned port
const httpServer = createServer()
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
})

function pushEvent(event: SessionEvent) {
  if (!sessionState) return
  if (sessionState.pendingResolve) {
    const resolve = sessionState.pendingResolve
    sessionState.pendingResolve = null
    resolve(event)
  } else {
    sessionState.queue.push(event)
  }
}

function endSession(reason: ExitReason) {
  if (!sessionState || sessionState.ended) return
  sessionState.ended = true
  if (sessionState.graceTimer) {
    clearTimeout(sessionState.graceTimer)
    sessionState.graceTimer = null
  }
  io.to(ROOM).emit("session_ended", { reason })
  pushEvent({ type: "exit", reason })
  unlink(sessionFile).catch(() => {})
  log({ event: "session_ended", sessionId, reason })
  // Note: sessionState stays set until the next get_design_feedback call drains
  // the queued exit event (or starts a fresh session). This guarantees the
  // exit is delivered to Claude even if it was queued.
}

io.on("connection", (socket) => {
  const clientSessionId = socket.handshake.auth?.sessionId
  if (clientSessionId !== sessionId) {
    console.error(
      `[socket.io] client ${socket.id} rejected (session mismatch)`
    )
    socket.disconnect(true)
    return
  }
  socket.join(ROOM)
  console.error(
    `[socket.io] client ${socket.id} joined session ${sessionId}`
  )

  // Reconnect within grace period — cancel pending teardown
  if (sessionState && sessionState.graceTimer) {
    clearTimeout(sessionState.graceTimer)
    sessionState.graceTimer = null
    log({ event: "session_reconnected", sessionId })
  }

  socket.on("design_feedback", (data: { content?: string }) => {
    pushEvent({ type: "feedback", content: data?.content ?? "" })
  })

  socket.on("stop_session", () => {
    endSession("user_stopped")
  })

  socket.on("disconnect", () => {
    console.error(`[socket.io] client disconnected: ${socket.id}`)
    if (!sessionState || sessionState.ended) return
    // Defer the room-size check so socket.io has finished updating the room
    setImmediate(() => {
      if (!sessionState || sessionState.ended) return
      const room = io.sockets.adapter.rooms.get(ROOM)
      if (room && room.size > 0) return
      if (sessionState.graceTimer) clearTimeout(sessionState.graceTimer)
      sessionState.graceTimer = setTimeout(() => {
        endSession("extension_closed")
      }, GRACE_PERIOD_MS)
    })
  })
})

const actualPort = await new Promise<number>((resolve) => {
  httpServer.listen(0, () => {
    const addr = httpServer.address()
    const port = typeof addr === "object" && addr ? addr.port : 0
    resolve(port)
  })
})

console.error(`[socket.io] listening on port ${actualPort}`)

// Cleanup session file on exit (safety net for mid-call crashes)
function cleanupSession() {
  try {
    unlinkSync(sessionFile)
  } catch {}
}

process.on("SIGINT", () => {
  cleanupSession()
  process.exit(0)
})
process.on("SIGTERM", () => {
  cleanupSession()
  process.exit(0)
})
process.on("exit", () => {
  cleanupSession()
})

// Discovery HTTP server on well-known port 58932
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function getActiveSessions() {
  const files = await readdir(SESSIONS_DIR)
  const sessions = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = await readFile(join(SESSIONS_DIR, file), "utf-8")
      const session = JSON.parse(raw)
      if (isProcessAlive(session.pid)) {
        sessions.push(session)
      } else {
        // Clean up stale session file
        unlink(join(SESSIONS_DIR, file)).catch(() => {})
      }
    } catch {
      // Skip malformed files
    }
  }
  return sessions
}

const discoveryServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/sessions") {
    try {
      const sessions = await getActiveSessions()
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      })
      res.end(JSON.stringify(sessions))
    } catch {
      res.writeHead(500)
      res.end("Internal Server Error")
    }
  } else {
    res.writeHead(404)
    res.end("Not Found")
  }
})

discoveryServer
  .listen(DISCOVERY_PORT, () => {
    console.error(`[discovery] listening on port ${DISCOVERY_PORT}`)
  })
  .on("error", () => {
    // Another instance already owns the discovery port — silently skip
    console.error(
      `[discovery] port ${DISCOVERY_PORT} already in use, skipping`
    )
  })

function openChrome() {
  const os = platform()
  const cmd =
    os === "darwin"
      ? 'open -a "Google Chrome"'
      : os === "win32"
        ? "start chrome"
        : "xdg-open http://localhost"
  exec(cmd, (err) => {
    if (err) console.error(`[chrome] failed to open: ${err.message}`)
    else console.error("[chrome] brought to foreground")
  })
}

function feedbackResponseText(content: string): string {
  return [
    `<handle-feedback session_id="${sessionId}">`,
    content,
    `</handle-feedback>`,
    ``,
    `The handle live session is still active. After implementing this feedback, immediately call get_design_feedback again with session_id="${sessionId}" (and the same agent_name and repo) to wait for the next round. Continue this loop until the response contains <handle-exit/>.`,
  ].join("\n")
}

function exitResponseText(reason: ExitReason): string {
  const human =
    reason === "user_stopped"
      ? "the user clicked Stop in the extension"
      : reason === "extension_closed"
        ? "the extension disconnected"
        : "the call was interrupted"
  return [
    `<handle-exit reason="${reason}"/>`,
    ``,
    `The handle live session has ended (${human}). Do not call get_design_feedback again unless the user explicitly asks to start a new session.`,
  ].join("\n")
}

// MCP server setup
const mcp = new McpServer({
  name: "handle",
  version: "1.0.0",
})

mcp.tool(
  "get_design_feedback",
  "Receive visual design feedback from the browser extension. The first call starts a live session; subsequent calls (passing the returned session_id) continue the same session for additional rounds. Each round returns either feedback to implement or an exit signal.",
  {
    agent_name: z
      .string()
      .describe(
        'Short identifier for the calling agent, e.g. "Claude Code"'
      ),
    repo: z.string().describe("The name of the repo being worked on"),
    context: z
      .string()
      .optional()
      .describe(
        "Description of the work done in the coding agent session so far, or omitted if the session has just started"
      ),
    session_id: z
      .string()
      .optional()
      .describe(
        "Pass the session_id returned by the previous call to continue the same live session. Omit on the first call to start a new session."
      ),
  },
  async (
    {
      agent_name: agentName,
      repo: toolRepo,
      context,
      session_id: incomingSessionId,
    },
    extra
  ) => {
    const requestId = nanoid()
    const isContinuation =
      incomingSessionId === sessionId && sessionState !== null

    if (!isContinuation) {
      // Fresh start — replace any stale state and bring Chrome forward
      openChrome()
      sessionState = {
        id: sessionId,
        agentName,
        repo: toolRepo,
        context,
        queue: [],
        pendingResolve: null,
        graceTimer: null,
        ended: false,
      }
      const sessionData = {
        id: sessionId,
        port: actualPort,
        pid: process.pid,
        agentName,
        repo: toolRepo,
        context,
        startedAt: new Date().toISOString(),
      }
      await writeFile(sessionFile, JSON.stringify(sessionData, null, 2))
      log({ event: "session_started", ...sessionData })
    } else {
      // Update mutable fields with latest from the agent
      sessionState!.agentName = agentName
      sessionState!.repo = toolRepo
      sessionState!.context = context
    }

    log({
      event: "tool_call",
      tool: "get_design_feedback",
      sessionId,
      requestId,
      agentName,
      repo: toolRepo,
      context,
      continuation: isContinuation,
    })

    let elapsed = 0
    const progressInterval = setInterval(() => {
      elapsed += PROGRESS_INTERVAL_MS
      const secs = elapsed / 1000
      extra.sendNotification({
        method: "notifications/progress" as const,
        params: {
          progressToken:
            extra._meta?.progressToken ?? extra.requestId,
          progress: secs,
          total: secs + PROGRESS_INTERVAL_MS / 1000,
        },
      })
    }, PROGRESS_INTERVAL_MS)

    const emit = (socket: Socket) => {
      ;(
        socket.emitWithAck("collect_feedback", {
          sessionId,
          sessionName: toolRepo,
          requestId,
          context,
          agentName,
        }) as Promise<{ content: string }>
      )
        .then((res) => {
          pushEvent({ type: "feedback", content: res.content })
        })
        .catch(() => {})
    }

    const onConnection = (socket: Socket) => {
      if (socket.rooms.has(ROOM)) emit(socket)
    }
    const onAbort = () => endSession("interrupted")

    try {
      let event: SessionEvent
      // Drain any queued event (e.g. an exit pending delivery, or feedback
      // that arrived while no tool call was in flight).
      const queued = sessionState!.queue.shift()
      if (queued) {
        event = queued
      } else {
        // Emit collect_feedback to currently-connected sockets and to any
        // that join while we're waiting.
        for (const [, socket] of io.sockets.sockets) {
          if (socket.rooms.has(ROOM)) emit(socket)
        }
        io.on("connection", onConnection)
        extra.signal.addEventListener("abort", onAbort, { once: true })

        event = await new Promise<SessionEvent>((resolve) => {
          sessionState!.pendingResolve = resolve
        })
      }

      if (event.type === "exit") {
        // Session is over — clear state so the next call (if any) starts fresh.
        sessionState = null
        const result = {
          content: [
            { type: "text" as const, text: exitResponseText(event.reason) },
          ],
        }
        log({
          event: "tool_response",
          sessionId,
          requestId,
          exit: event.reason,
        })
        return result
      }

      const result = {
        content: [
          {
            type: "text" as const,
            text: feedbackResponseText(event.content),
          },
        ],
      }
      log({
        event: "tool_response",
        sessionId,
        requestId,
        contentLength: event.content.length,
      })
      return result
    } finally {
      clearInterval(progressInterval)
      io.removeListener("connection", onConnection)
      extra.signal.removeEventListener("abort", onAbort)
      if (sessionState) sessionState.pendingResolve = null
    }
  }
)

const transport = new StdioServerTransport()
await mcp.connect(transport)
console.error("[mcp] server running on stdio")
