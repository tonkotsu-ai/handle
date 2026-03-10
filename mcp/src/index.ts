#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { nanoid } from "nanoid";
import { z } from "zod";
import { appendFile, mkdir, writeFile, unlink, readdir, readFile } from "fs/promises";
import { unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const LOG_DIR = join(homedir(), ".palette");
const LOG_FILE = join(LOG_DIR, "palette.log");
const SESSIONS_DIR = join(LOG_DIR, "sessions");

await mkdir(SESSIONS_DIR, { recursive: true });

function log(entry: Record<string, unknown>) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  appendFile(LOG_FILE, line + "\n").catch(() => {});
}

const sessionId = nanoid();
const sessionFile = join(SESSIONS_DIR, `${sessionId}.json`);
console.error(`[mcp] session ${sessionId}`);

const DISCOVERY_PORT = 58932;
const PROGRESS_INTERVAL_MS = 5_000;

// Socket.IO setup — bind to port 0 for OS-assigned port
const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  const clientSessionId = socket.handshake.auth?.sessionId;
  if (clientSessionId !== sessionId) {
    console.error(`[socket.io] client ${socket.id} rejected (session mismatch)`);
    socket.disconnect(true);
    return;
  }
  socket.join(`session:${sessionId}`);
  console.error(`[socket.io] client ${socket.id} joined session ${sessionId}`);
  socket.on("disconnect", () => {
    console.error(`[socket.io] client disconnected: ${socket.id}`);
  });
});

const actualPort = await new Promise<number>((resolve) => {
  httpServer.listen(0, () => {
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    resolve(port);
  });
});

console.error(`[socket.io] listening on port ${actualPort}`);

// Cleanup session file on exit (safety net for mid-call crashes)
function cleanupSession() {
  try {
    unlinkSync(sessionFile);
  } catch {}
}

process.on("SIGINT", () => {
  cleanupSession();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupSession();
  process.exit(0);
});
process.on("exit", () => {
  cleanupSession();
});

// Discovery HTTP server on well-known port 58932
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getActiveSessions() {
  const files = await readdir(SESSIONS_DIR);
  const sessions = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(SESSIONS_DIR, file), "utf-8");
      const session = JSON.parse(raw);
      if (isProcessAlive(session.pid)) {
        sessions.push(session);
      } else {
        // Clean up stale session file
        unlink(join(SESSIONS_DIR, file)).catch(() => {});
      }
    } catch {
      // Skip malformed files
    }
  }
  return sessions;
}

const discoveryServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/sessions") {
    try {
      const sessions = await getActiveSessions();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(sessions));
    } catch {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

discoveryServer.listen(DISCOVERY_PORT, () => {
  console.error(`[discovery] listening on port ${DISCOVERY_PORT}`);
}).on("error", () => {
  // Another instance already owns the discovery port — silently skip
  console.error(`[discovery] port ${DISCOVERY_PORT} already in use, skipping`);
});

// MCP server setup
const mcp = new McpServer({
  name: "palette-mcp",
  version: "0.1.0",
});

mcp.tool(
  "get_design_feedback",
  "Broadcast a feedback request to connected clients and wait for a response",
  {
    repo: z.string().describe("The name of the repo being worked on"),
    context: z.string().optional().describe("Description of the work done in the coding agent session so far, or omitted if the session has just started"),
  },
  async ({ repo: toolRepo, context }, extra) => {
    const id = nanoid();
    log({ event: "tool_call", tool: "get_design_feedback", sessionId, requestId: id, repo: toolRepo, context });
    console.error(`[mcp] emitting collect_feedback sessionId=${sessionId} requestId=${id}`);

    // Register session for discovery while the call is in flight
    const sessionData = {
      id: sessionId,
      port: actualPort,
      pid: process.pid,
      repo: toolRepo,
      context,
      startedAt: new Date().toISOString(),
    };
    await writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
    log({ event: "session_registered", ...sessionData });

    let elapsed = 0;
    const progressInterval = setInterval(() => {
      elapsed += PROGRESS_INTERVAL_MS;
      const secs = elapsed / 1000;
      extra.sendNotification({
        method: "notifications/progress" as const,
        params: {
          progressToken: extra._meta?.progressToken ?? extra.requestId,
          progress: secs,
          total: secs + PROGRESS_INTERVAL_MS / 1000,
        },
      });
      console.error(`[mcp] progress ping elapsed=${secs}s`);
    }, PROGRESS_INTERVAL_MS);

    try {
      const content = await new Promise<string>((resolve) => {
        let resolved = false;

        const emit = (socket: import("socket.io").Socket) => {
          (socket.emitWithAck("collect_feedback", { sessionName: toolRepo, requestId: id, context }) as Promise<{ content: string }>)
            .then((res) => {
              if (!resolved) {
                resolved = true;
                io.removeListener("connection", onConnection);
                resolve(res.content);
              }
            })
            .catch(() => {});
        };

        // Emit to already-connected sockets in this session's room
        for (const [, socket] of io.sockets.sockets) {
          if (socket.rooms.has(`session:${sessionId}`)) {
            emit(socket);
          }
        }

        // Also emit to any sockets that join the room while waiting
        const onConnection = (socket: import("socket.io").Socket) => {
          // Socket joins the room in the connection handler above,
          // so by the time this fires it will be in the room
          if (socket.rooms.has(`session:${sessionId}`)) {
            emit(socket);
          }
        };
        io.on("connection", onConnection);
      });

      const result = { content: [{ type: "text" as const, text: content }] };
      log({ event: "tool_response", tool: "get_design_feedback", result });
      return result;
    } finally {
      clearInterval(progressInterval);
      // Unregister session — call is no longer in flight
      await unlink(sessionFile).catch(() => {});
      log({ event: "session_unregistered", sessionId });
    }
  }
);

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("[mcp] server running on stdio");
