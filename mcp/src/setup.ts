import { intro, outro, multiselect, confirm, spinner, cancel, isCancel, note } from "@clack/prompts"
import { spawn } from "child_process"
import { getAgents, getProjectAgents } from "./agents.js"

export async function runSetup(opts: { projectRoot?: string } = {}): Promise<void> {
  intro("Handle — Design feedback for AI coding agents")

  if (opts.projectRoot) {
    note(`Installing for project:\n${opts.projectRoot}`, "Project mode")
  }

  const agents = opts.projectRoot
    ? getProjectAgents(opts.projectRoot)
    : getAgents()

  // Detect installed agents
  const s = spinner()
  s.start("Scanning for coding agents")
  const detected: typeof agents = []
  for (const agent of agents) {
    if (await agent.detect()) {
      detected.push(agent)
    }
  }
  s.stop(
    detected.length > 0
      ? `Found ${detected.length} coding agent${detected.length === 1 ? "" : "s"}`
      : "No coding agents found"
  )

  if (detected.length === 0) {
    note(
      "Supported: Claude Code, Codex, Cursor, Claude Desktop,\nGitHub Copilot, Gemini CLI, Rovo Dev, Windsurf",
      "No agents detected"
    )
    outro("Install a supported coding agent and try again.")
    return
  }

  const selection = await multiselect({
    message: "Which agents should Handle connect to?",
    options: detected.map((agent) => ({
      value: agent.id,
      label: agent.name,
    })),
    required: true,
    initialValues: detected.map((agent) => agent.id),
  })

  if (isCancel(selection)) {
    cancel("Setup cancelled.")
    process.exit(0)
  }

  const selected = detected.filter((agent) => selection.includes(agent.id))

  const configSpinner = spinner()
  for (const agent of selected) {
    configSpinner.start(`Configuring ${agent.name}`)
    const result = await agent.configure()
    const statusLabel =
      result.status === "created"
        ? "configured"
        : result.status === "updated"
          ? "updated"
          : result.status === "already_configured"
            ? "already configured"
            : `error: ${result.message}`
    configSpinner.stop(`${agent.name} — ${statusLabel}`)
  }

  const EXTENSION_URL =
    "https://chromewebstore.google.com/detail/pfcfpjololfdopoglgplmijaohidmopj"

  note(
    "Install the Handle Chrome extension to start\nsending design feedback from your browser.",
    "Last step"
  )

  const shouldOpen = await confirm({
    message: "Open the Chrome Web Store page?",
    initialValue: true,
  })

  if (isCancel(shouldOpen)) {
    cancel("Setup cancelled.")
    process.exit(0)
  }

  if (shouldOpen) {
    const platform = process.platform
    const cmd =
      platform === "win32" ? "start" : platform === "darwin" ? "open" : "xdg-open"
    spawn(cmd, [EXTENSION_URL], { detached: true, stdio: "ignore" }).unref()
  } else {
    note(EXTENSION_URL, "Install later at")
  }

  outro("Setup complete! Restart your coding agent to activate Handle.")
}
