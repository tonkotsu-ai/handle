import { spawn } from "child_process"
import { io } from "socket.io-client"

// Short grace period so the disconnect scenario completes quickly.
const GRACE_MS = 500

const server = spawn("node", ["dist/index.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, HANDLE_GRACE_PERIOD_MS: String(GRACE_MS) },
})

let stderr = ""
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString()
  process.stderr.write(chunk)
})

const { actualPort, sessionId } = await new Promise((resolve) => {
  let port = null
  let sid = null
  const check = setInterval(() => {
    if (!sid) {
      const m = stderr.match(/\[mcp\] session (\S+)/)
      if (m) sid = m[1]
    }
    if (!port) {
      const m = stderr.match(/\[socket\.io\] listening on port (\d+)/)
      if (m) port = Number(m[1])
    }
    if (port && sid) {
      clearInterval(check)
      resolve({ actualPort: port, sessionId: sid })
    }
  }, 50)
})

console.log(`[test] server ready: port=${actualPort} session=${sessionId}`)
const SERVER_URL = `http://localhost:${actualPort}`

let msgId = 1
function sendMCP(msg) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n")
}

let stdoutBuf = ""
const responses = []
server.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString()
  const lines = stdoutBuf.split("\n")
  stdoutBuf = lines.pop()
  for (const l of lines) if (l.trim()) responses.push(JSON.parse(l))
})

function waitFor(predicate, label, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`Timeout: ${label}`)),
      timeoutMs
    )
    const check = setInterval(() => {
      const idx = responses.findIndex(predicate)
      if (idx !== -1) {
        clearInterval(check)
        clearTimeout(deadline)
        resolve(responses.splice(idx, 1)[0])
      }
    }, 25)
  })
}

async function callTool(args) {
  const id = msgId++
  sendMCP({
    id,
    method: "tools/call",
    params: { name: "get_design_feedback", arguments: args },
  })
  return waitFor((r) => r.id === id, `tools/call id=${id}`)
}

function fail(msg) {
  console.error("[test] FAIL:", msg)
  server.kill()
  process.exit(1)
}

function assertContains(text, expected, label) {
  if (typeof text !== "string" || !text.includes(expected)) {
    fail(`${label}: expected substring ${JSON.stringify(expected)} in:\n${text}`)
  }
  console.log(`[test] PASS: ${label}`)
}

async function connectClient() {
  const client = io(SERVER_URL, { auth: { sessionId } })
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("connect_error", reject)
  })
  return client
}

// Initialize MCP
sendMCP({
  id: msgId,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "0.1.0" },
  },
})
await waitFor((r) => r.id === msgId++, "initialize")
sendMCP({ method: "notifications/initialized" })
console.log("[test] MCP initialized")

// === SCENARIO A: multi-round with continuation, ending in stop_session ===
console.log("[test] === SCENARIO A: multi-round + stop ===")
let client = await connectClient()
let roundCount = 0

const handleRound = (data, callback) => {
  roundCount += 1
  if (!data.sessionId || !data.requestId) {
    fail("collect_feedback missing sessionId/requestId")
  }
  setTimeout(
    () => callback({ content: `round ${roundCount} feedback` }),
    50
  )
}
client.on("collect_feedback", handleRound)

// Round 1 — no session_id (fresh start)
let resp = await callTool({ agent_name: "test", repo: "test-repo" })
let text = resp.result.content[0].text
assertContains(text, '<handle-feedback session_id="', "round 1: wrapper")
assertContains(text, "round 1 feedback", "round 1: content")
const sidMatch = text.match(/session_id="([^"]+)"/)
if (!sidMatch) fail("could not extract session_id from round 1 response")
const liveSid = sidMatch[1]
if (liveSid !== sessionId) {
  fail(`session_id mismatch: tool returned ${liveSid}, expected ${sessionId}`)
}
console.log(`[test] PASS: extracted session_id=${liveSid}`)

// Round 2 — pass session_id back
resp = await callTool({
  agent_name: "test",
  repo: "test-repo",
  session_id: liveSid,
})
text = resp.result.content[0].text
assertContains(text, "round 2 feedback", "round 2: content")
assertContains(
  text,
  `session_id="${liveSid}"`,
  "round 2: same session_id reused"
)

// Round 3 — replace handler so the client emits stop_session instead of replying
client.removeAllListeners("collect_feedback")
client.on("collect_feedback", () => {
  setTimeout(() => client.emit("stop_session"), 50)
})
resp = await callTool({
  agent_name: "test",
  repo: "test-repo",
  session_id: liveSid,
})
text = resp.result.content[0].text
assertContains(
  text,
  '<handle-exit reason="user_stopped"/>',
  "stop: exit reason"
)

client.disconnect()
// Wait briefly so the server's disconnect handler runs without firing the
// grace teardown for an already-ended session.
await new Promise((r) => setTimeout(r, 100))

// === SCENARIO B: fresh session, then extension disconnects → grace timeout ===
console.log("[test] === SCENARIO B: disconnect grace ===")
client = await connectClient()
client.on("collect_feedback", () => {
  // Disconnect without acking — server should end via grace timer
  setTimeout(() => client.disconnect(), 50)
})
resp = await callTool({ agent_name: "test", repo: "test-repo" })
text = resp.result.content[0].text
assertContains(
  text,
  '<handle-exit reason="extension_closed"/>',
  "disconnect: exit reason"
)

console.log("[test] all scenarios passed")
server.kill()
process.exit(0)
