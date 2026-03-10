import { spawn } from "child_process";
import { io } from "socket.io-client";

const DUMMY_FEEDBACK = "Looks great! The spacing is perfect.";

// Start the MCP server as a child process with --repo flag
const server = spawn("node", ["dist/index.js", "--repo", "test-repo"], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
  process.stderr.write(chunk);
});

// Wait for Socket.IO to be ready and parse session ID + port from stderr
const { actualPort, sessionId } = await new Promise((resolve) => {
  let port = null;
  let sid = null;
  const check = setInterval(() => {
    if (!sid) {
      const m = stderr.match(/\[mcp\] session (\S+)/);
      if (m) sid = m[1];
    }
    if (!port) {
      const m = stderr.match(/\[socket\.io\] listening on port (\d+)/);
      if (m) port = Number(m[1]);
    }
    if (port && sid) {
      clearInterval(check);
      resolve({ actualPort: port, sessionId: sid });
    }
  }, 100);
});

console.log(`[test] Socket.IO server on port ${actualPort}, session ${sessionId}`);
const SERVER_URL = `http://localhost:${actualPort}`;

// Connect a Socket.IO client with session auth
const client = io(SERVER_URL, { auth: { sessionId } });
await new Promise((resolve, reject) => {
  client.on("connect", resolve);
  client.on("connect_error", reject);
});
console.log("[test] Socket.IO client connected");

// Listen for collect_feedback and reply via ack after a delay to test progress notifications
client.on("collect_feedback", (data, callback) => {
  console.log("[test] received collect_feedback:", JSON.stringify(data));
  if (!data.sessionId || !data.requestId) {
    console.error("[test] FAIL: missing sessionId or requestId in collect_feedback");
    process.exit(1);
  }
  console.log("[test] waiting 7s to verify progress notifications...");
  setTimeout(() => {
    console.log("[test] sending ack with feedback...");
    callback({ content: DUMMY_FEEDBACK });
  }, 7000);
});

// Send MCP initialize request
let msgId = 1;
function sendMCP(msg) {
  const json = JSON.stringify({ jsonrpc: "2.0", ...msg });
  server.stdin.write(json + "\n");
}

// Collect stdout (MCP responses)
let stdoutBuf = "";
const responses = [];
server.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString();
  const lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop(); // keep incomplete line
  for (const line of lines) {
    if (line.trim()) {
      responses.push(JSON.parse(line));
    }
  }
});

function waitForResponse(id, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Timeout waiting for response id=${id}`)), timeoutMs);
    const check = setInterval(() => {
      const idx = responses.findIndex((r) => r.id === id);
      if (idx !== -1) {
        clearInterval(check);
        clearTimeout(deadline);
        resolve(responses.splice(idx, 1)[0]);
      }
    }, 50);
  });
}

// 1. Initialize
sendMCP({ id: msgId, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0.1.0" } } });
const initResp = await waitForResponse(msgId++);
console.log("[test] initialized:", initResp.result.serverInfo.name);

// Send initialized notification
sendMCP({ method: "notifications/initialized" });

// 2. Call get_design_feedback (with progressToken in _meta)
const toolCallId = msgId++;
sendMCP({ id: toolCallId, method: "tools/call", params: { name: "get_design_feedback", arguments: {}, _meta: { progressToken: "progress-1" } } });

// 3. Collect progress notifications while waiting for the tool result
const progressNotifications = [];
const toolResp = await new Promise((resolve, reject) => {
  const deadline = setTimeout(() => reject(new Error("Timeout waiting for tool response")), 20000);
  const check = setInterval(() => {
    // Collect any progress notifications (no id field = notification)
    for (let i = responses.length - 1; i >= 0; i--) {
      const r = responses[i];
      if (!r.id && r.method === "notifications/progress") {
        progressNotifications.push(responses.splice(i, 1)[0]);
      }
    }
    // Check for tool response
    const idx = responses.findIndex((r) => r.id === toolCallId);
    if (idx !== -1) {
      clearInterval(check);
      clearTimeout(deadline);
      resolve(responses.splice(idx, 1)[0]);
    }
  }, 50);
});

// 4. Verify progress notifications were sent
if (progressNotifications.length > 0) {
  console.log(`[test] PASS: received ${progressNotifications.length} progress notification(s)`);
  for (const n of progressNotifications) {
    console.log("[test]   progress:", JSON.stringify(n.params));
  }
} else {
  console.error("[test] FAIL: no progress notifications received");
  process.exit(1);
}

// 5. Verify result
const text = toolResp.result?.content?.[0]?.text;
if (text === DUMMY_FEEDBACK) {
  console.log("[test] PASS: got expected feedback:", text);
} else {
  console.error("[test] FAIL: unexpected result:", JSON.stringify(toolResp));
  process.exit(1);
}

// Cleanup
client.disconnect();
server.kill();
console.log("[test] done");
process.exit(0);
