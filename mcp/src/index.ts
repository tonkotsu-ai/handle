#!/usr/bin/env node

import { execSync } from "child_process"

const command = process.argv[2]

if (command === "init") {
  const isProject = process.argv.includes("--project")
  let projectRoot: string | undefined
  if (isProject) {
    try {
      projectRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim()
    } catch {
      console.error("  Error: not inside a git repository.")
      process.exit(1)
    }
  }
  const { runSetup } = await import("./setup.js")
  await runSetup({ projectRoot })
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
handle-ext — Design feedback bridge for AI coding agents

Usage:
  npx handle-ext                    Run MCP server (stdio mode)
  npx handle-ext init               Configure coding agents globally
  npx handle-ext init --project     Configure coding agents for current project
  npx handle-ext help               Show this help message
`)
}
