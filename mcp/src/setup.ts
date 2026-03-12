import { createInterface } from "readline"
import { getAgents } from "./agents.js"

export async function runSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let closed = false
  rl.on("close", () => {
    closed = true
  })
  const ask = (q: string) =>
    new Promise<string>((resolve, reject) => {
      if (closed) return reject(new Error("stdin closed"))
      rl.question(q, resolve)
    })

  console.log()
  console.log("  Handle — Design feedback for AI coding agents")
  console.log()

  const agents = getAgents()

  // Detect installed agents
  const detected: typeof agents = []
  for (const agent of agents) {
    if (await agent.detect()) {
      detected.push(agent)
    }
  }

  if (detected.length === 0) {
    console.log("  No supported coding agents detected.")
    console.log(
      "  Supported: Claude Code, Claude Desktop, Cursor, Windsurf"
    )
    console.log()
    rl.close()
    return
  }

  console.log("  Detected coding agents:")
  console.log()
  detected.forEach((agent, i) => {
    console.log(`    ${i + 1}. ${agent.name}`)
  })
  console.log(`    a. All of the above`)
  console.log()

  let answer: string
  try {
    answer = await ask(
      "  Which agents to configure? (e.g. 1,3 or a for all): "
    )
  } catch {
    console.log()
    rl.close()
    return
  }
  const trimmed = answer.trim().toLowerCase()

  let selected: typeof agents
  if (trimmed === "a" || trimmed === "all") {
    selected = detected
  } else {
    const indices = trimmed
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n >= 1 && n <= detected.length)
    selected = indices.map((i) => detected[i - 1])
  }

  if (selected.length === 0) {
    console.log("  No agents selected.")
    rl.close()
    return
  }

  console.log()

  for (const agent of selected) {
    process.stdout.write(`  Configuring ${agent.name}... `)
    const result = await agent.configure()
    switch (result.status) {
      case "created":
        console.log("done")
        break
      case "updated":
        console.log("updated")
        break
      case "already_configured":
        console.log("already configured")
        break
      case "error":
        console.log(`error: ${result.message}`)
        break
    }
  }

  console.log()
  console.log(
    "  Setup complete! Restart your coding agent to activate Handle."
  )
  console.log()

  rl.close()
}
