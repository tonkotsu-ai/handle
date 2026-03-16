#!/usr/bin/env node

const command = process.argv[2]

if (command === "setup") {
  const { runSetup } = await import("./setup.js")
  await runSetup()
} else if (command === "help" || command === "--help" || command === "-h") {
  printHelp()
} else if (command && command !== "serve" && !command.startsWith("-")) {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
} else {
  // Default: run MCP server (stdio mode)
  // If stdin is a TTY and no explicit "serve", show help instead of hanging
  if (process.stdin.isTTY && command !== "serve") {
    printHelp()
    process.exit(0)
  }
  await import("./server.js")
}

function printHelp() {
  console.log(`
handle-design — Design feedback bridge for AI coding agents

Usage:
  npx handle-design           Run MCP server (stdio mode)
  npx handle-design setup     Configure coding agents to use Handle
  npx handle-design help      Show this help message
`)
}
