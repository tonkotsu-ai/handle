import { homedir, platform } from "os"
import { join, dirname } from "path"
import { readFile, writeFile, mkdir, access } from "fs/promises"
import { constants } from "fs"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"

const SERVER_NAME = "handle"

const MCP_ENTRY = {
  command: "npx",
  args: ["-y", "handle-ext@latest"],
}

const MCP_ENTRY_VSCODE = {
  type: "stdio",
  command: "npx",
  args: ["-y", "handle-ext@latest"],
}

const MCP_ENTRY_ROVODEV = {
  transport: "stdio",
  command: "npx",
  args: ["-y", "handle-ext@latest"],
}

const MCP_ENTRY_COPILOT_CLI = {
  type: "stdio",
  command: "npx",
  args: ["-y", "handle-ext@latest"],
}

const HANDLE_COMMAND = `Call the handle MCP's get_design_feedback tool to receive visual design feedback from the browser extension. While the tool is running, tell the user to go to Chrome, navigate to their project, and click on the Handle Extension in Chrome to give feedback.

The tool runs as a persistent live session that spans many rounds. Each call returns one of two response shapes:

1. \`<handle-feedback session_id="X"> ... </handle-feedback>\` — implement the feedback, then **immediately call get_design_feedback again with session_id="X"** (and the same agent_name and repo) to wait for the next round. Do not wait for further user input in chat — the user is driving the loop from the browser extension.

2. \`<handle-exit reason="..."/>\` — the live session is over. Tell the user the session ended and stop calling the tool. Only call get_design_feedback again if the user explicitly asks to start a new session.

Keep looping on shape 1 until you get shape 2.
`

const HANDLE_COPILOT_SKILL_MD = `---
name: handle
description: Receive visual design feedback from the browser extension and implement the requested changes.
disable-model-invocation: true
---
${HANDLE_COMMAND}`

const HANDLE_CODEX_SKILL_MD = `---
name: handle
description: Receive visual design feedback from the browser extension and implement the requested changes.
---
${HANDLE_COMMAND}`

const HANDLE_CODEX_OPENAI_YAML = `policy:
  allow_implicit_invocation: false
`

const HANDLE_GEMINI_COMMAND = `description = "Receive visual design feedback from the browser extension and implement the requested changes."
prompt = """Call the handle MCP's get_design_feedback tool to receive visual design feedback from the browser extension. While the tool is running, tell the user to go to Chrome, navigate to their project, and click on the Handle Extension in Chrome to give feedback.

The tool runs as a persistent live session that spans many rounds. Each call returns one of two response shapes:

1. <handle-feedback session_id="X"> ... </handle-feedback> — implement the feedback, then immediately call get_design_feedback again with session_id="X" (and the same agent_name and repo) to wait for the next round. Do not wait for further user input in chat — the user is driving the loop from the browser extension.

2. <handle-exit reason="..."/> — the live session is over. Tell the user the session ended and stop calling the tool. Only call get_design_feedback again if the user explicitly asks to start a new session.

Keep looping on shape 1 until you get shape 2."""
`

const HANDLE_ROVODEV_PROMPT_ENTRY = `- name: handle
  description: Receive visual design feedback from the browser extension and implement the requested changes.
  content_file: handle_prompt.md
`

async function mergeRovoDevPrompts(promptsPath: string): Promise<void> {
  let existing = ""
  try {
    existing = await readFile(promptsPath, "utf-8")
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }

  if (existing.includes("name: handle")) return

  const content = existing.trimEnd()
  const updated = content
    ? content + "\n" + HANDLE_ROVODEV_PROMPT_ENTRY
    : `prompts:\n${HANDLE_ROVODEV_PROMPT_ENTRY}`
  await writeFile(promptsPath, updated + "\n")
}

export interface AgentConfig {
  id: string
  name: string
  configPath: string
  detect: () => Promise<boolean>
  configure: () => Promise<ConfigResult>
}

export interface ConfigResult {
  status: "created" | "updated" | "already_configured" | "error"
  message: string
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function mergeConfig(
  configPath: string,
  serverName: string,
  entry: Record<string, unknown>
): Promise<ConfigResult> {
  let existing: Record<string, unknown> = {}

  try {
    const raw = await readFile(configPath, "utf-8")
    if (raw.trim()) {
      existing = JSON.parse(raw)
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        status: "error",
        message: `Failed to read ${configPath}: ${err}`,
      }
    }
  }

  const servers =
    (existing.mcpServers as Record<string, unknown>) ?? {}

  if (servers[serverName]) {
    if (JSON.stringify(servers[serverName]) === JSON.stringify(entry)) {
      return {
        status: "already_configured",
        message: "Already configured",
      }
    }
    servers[serverName] = entry
    existing.mcpServers = servers
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify(existing, null, 2) + "\n"
    )
    return { status: "updated", message: "Updated existing entry" }
  }

  servers[serverName] = entry
  existing.mcpServers = servers
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(
    configPath,
    JSON.stringify(existing, null, 2) + "\n"
  )
  return { status: "created", message: "Added handle entry" }
}

async function mergeVscodeConfig(
  configPath: string,
  serverName: string,
  entry: Record<string, unknown>
): Promise<ConfigResult> {
  let existing: Record<string, unknown> = {}

  try {
    const raw = await readFile(configPath, "utf-8")
    if (raw.trim()) {
      existing = JSON.parse(raw)
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        status: "error",
        message: `Failed to read ${configPath}: ${err}`,
      }
    }
  }

  const mcp = (existing.mcp as Record<string, unknown>) ?? {}
  const servers = (mcp.servers as Record<string, unknown>) ?? {}

  if (servers[serverName]) {
    if (JSON.stringify(servers[serverName]) === JSON.stringify(entry)) {
      return {
        status: "already_configured",
        message: "Already configured",
      }
    }
    servers[serverName] = entry
    mcp.servers = servers
    existing.mcp = mcp
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify(existing, null, 2) + "\n"
    )
    return { status: "updated", message: "Updated existing entry" }
  }

  servers[serverName] = entry
  mcp.servers = servers
  existing.mcp = mcp
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(
    configPath,
    JSON.stringify(existing, null, 2) + "\n"
  )
  return { status: "created", message: "Added handle entry" }
}

// For .vscode/mcp.json which uses { "servers": {} } at root (not nested under "mcp")
async function mergeVscodeMcpJson(
  configPath: string,
  serverName: string,
  entry: Record<string, unknown>
): Promise<ConfigResult> {
  let existing: Record<string, unknown> = {}

  try {
    const raw = await readFile(configPath, "utf-8")
    if (raw.trim()) {
      existing = JSON.parse(raw)
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        status: "error",
        message: `Failed to read ${configPath}: ${err}`,
      }
    }
  }

  const servers = (existing.servers as Record<string, unknown>) ?? {}

  if (servers[serverName]) {
    if (JSON.stringify(servers[serverName]) === JSON.stringify(entry)) {
      return { status: "already_configured", message: "Already configured" }
    }
    servers[serverName] = entry
    existing.servers = servers
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n")
    return { status: "updated", message: "Updated existing entry" }
  }

  servers[serverName] = entry
  existing.servers = servers
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, JSON.stringify(existing, null, 2) + "\n")
  return { status: "created", message: "Added handle entry" }
}

async function mergeTomlConfig(
  configPath: string,
  serverName: string,
  command: string,
  args: string[]
): Promise<ConfigResult> {
  let existing: Record<string, unknown> = {}

  try {
    const raw = await readFile(configPath, "utf-8")
    existing = parseToml(raw) as Record<string, unknown>
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return {
        status: "error",
        message: `Failed to read ${configPath}: ${err}`,
      }
    }
  }

  const mcpServers =
    (existing.mcp_servers as Record<string, unknown>) ?? {}
  const currentEntry = mcpServers[serverName] as
    | Record<string, unknown>
    | undefined

  const newEntry = { command, args }

  if (currentEntry) {
    if (JSON.stringify(currentEntry) === JSON.stringify(newEntry)) {
      return {
        status: "already_configured",
        message: "Already configured",
      }
    }
    mcpServers[serverName] = newEntry
    existing.mcp_servers = mcpServers
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, stringifyToml(existing))
    return { status: "updated", message: "Updated existing entry" }
  }

  mcpServers[serverName] = newEntry
  existing.mcp_servers = mcpServers
  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, stringifyToml(existing))
  return { status: "created", message: "Added handle entry" }
}

function getVscodeSettingsPath(): string {
  const home = homedir()
  const os = platform()
  if (os === "win32") {
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User", "settings.json")
  } else if (os === "darwin") {
    return join(home, "Library", "Application Support", "Code", "User", "settings.json")
  } else {
    return join(home, ".config", "Code", "User", "settings.json")
  }
}

export function getProjectAgents(projectRoot: string): AgentConfig[] {
  const home = homedir()
  const agents: AgentConfig[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      configPath: join(projectRoot, ".claude", "settings.json"),
      detect: () => exists(join(home, ".claude.json")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".claude", "settings.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle slash command
        const cmdDir = join(projectRoot, ".claude", "commands")
        const cmdPath = join(cmdDir, "handle.md")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_COMMAND)
        return result
      },
    },
    {
      id: "codex",
      name: "Codex",
      configPath: join(projectRoot, ".codex", "config.toml"),
      detect: () => exists(join(home, ".codex")),
      configure: async () => {
        const result = await mergeTomlConfig(
          join(projectRoot, ".codex", "config.toml"),
          SERVER_NAME,
          MCP_ENTRY.command,
          MCP_ENTRY.args
        )
        // Also install $handle skill
        const skillDir = join(projectRoot, ".agents", "skills", "handle")
        await mkdir(join(skillDir, "agents"), { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_CODEX_SKILL_MD)
        await writeFile(join(skillDir, "agents", "openai.yaml"), HANDLE_CODEX_OPENAI_YAML)
        return result
      },
    },
    {
      id: "cursor",
      name: "Cursor",
      configPath: join(projectRoot, ".cursor", "mcp.json"),
      detect: () => exists(join(home, ".cursor")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".cursor", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle slash command
        const cmdDir = join(projectRoot, ".cursor", "commands")
        const cmdPath = join(cmdDir, "handle.md")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_COMMAND)
        return result
      },
    },
    {
      id: "github-copilot",
      name: "GitHub Copilot (VS Code)",
      configPath: join(projectRoot, ".vscode", "mcp.json"),
      detect: () => exists(dirname(getVscodeSettingsPath())),
      configure: async () => {
        const result = await mergeVscodeMcpJson(
          join(projectRoot, ".vscode", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY_VSCODE
        )
        // Also install /handle skill
        const skillDir = join(projectRoot, ".github", "skills", "handle")
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_COPILOT_SKILL_MD)
        return result
      },
    },
    {
      id: "copilot-cli",
      name: "GitHub Copilot CLI",
      configPath: join(projectRoot, ".copilot", "mcp-config.json"),
      detect: () => exists(join(home, ".copilot")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".copilot", "mcp-config.json"),
          SERVER_NAME,
          MCP_ENTRY_COPILOT_CLI
        )
        // Also install /handle skill
        const skillDir = join(projectRoot, ".github", "skills", "handle")
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_COPILOT_SKILL_MD)
        return result
      },
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      configPath: join(projectRoot, ".gemini", "settings.json"),
      detect: () => exists(join(home, ".gemini")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".gemini", "settings.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle custom command
        const cmdDir = join(projectRoot, ".gemini", "commands")
        const cmdPath = join(cmdDir, "handle.toml")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_GEMINI_COMMAND)
        return result
      },
    },
    {
      id: "rovo-dev",
      name: "Rovo Dev",
      configPath: join(projectRoot, ".rovodev", "mcp.json"),
      detect: () => exists(join(home, ".rovodev")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".rovodev", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY_ROVODEV
        )
        // Also install /prompts handle
        const dir = join(projectRoot, ".rovodev")
        await mkdir(dir, { recursive: true })
        await mergeRovoDevPrompts(join(dir, "prompts.yml"))
        await writeFile(join(dir, "handle_prompt.md"), HANDLE_COMMAND)
        return result
      },
    },
    {
      id: "windsurf",
      name: "Windsurf",
      configPath: join(projectRoot, ".windsurf", "mcp.json"),
      detect: () => exists(join(home, ".codeium", "windsurf")),
      configure: async () => {
        const result = await mergeConfig(
          join(projectRoot, ".windsurf", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle workflow
        const wfDir = join(projectRoot, ".windsurf", "workflows")
        const wfPath = join(wfDir, "handle.md")
        await mkdir(wfDir, { recursive: true })
        await writeFile(wfPath, HANDLE_COMMAND)
        return result
      },
    },
  ]

  return agents
}

export function getAgents(): AgentConfig[] {
  const home = homedir()
  const agents: AgentConfig[] = [
    {
      id: "claude-code",
      name: "Claude Code",
      configPath: join(home, ".claude.json"),
      detect: () => exists(join(home, ".claude.json")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".claude.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle slash command
        const cmdDir = join(home, ".claude", "commands")
        const cmdPath = join(cmdDir, "handle.md")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_COMMAND)
        return result
      },
    },
    {
      id: "codex",
      name: "Codex",
      configPath: join(home, ".codex", "config.toml"),
      detect: () => exists(join(home, ".codex")),
      configure: async () => {
        const result = await mergeTomlConfig(
          join(home, ".codex", "config.toml"),
          SERVER_NAME,
          MCP_ENTRY.command,
          MCP_ENTRY.args
        )
        // Also install $handle skill
        const skillDir = join(home, ".agents", "skills", "handle")
        await mkdir(join(skillDir, "agents"), { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_CODEX_SKILL_MD)
        await writeFile(join(skillDir, "agents", "openai.yaml"), HANDLE_CODEX_OPENAI_YAML)
        return result
      },
    },
    {
      id: "cursor",
      name: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      detect: () => exists(join(home, ".cursor")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".cursor", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle slash command
        const cmdDir = join(home, ".cursor", "commands")
        const cmdPath = join(cmdDir, "handle.md")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_COMMAND)
        return result
      },
    },
  ]

  if (platform() === "darwin") {
    agents.push({
      id: "claude-desktop",
      name: "Claude Desktop",
      configPath: join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      ),
      detect: () =>
        exists(join(home, "Library", "Application Support", "Claude")),
      configure: () =>
        mergeConfig(
          join(
            home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json"
          ),
          SERVER_NAME,
          MCP_ENTRY
        ),
    })
  }

  agents.push(
    {
      id: "github-copilot",
      name: "GitHub Copilot (VS Code)",
      configPath: getVscodeSettingsPath(),
      detect: () => exists(dirname(getVscodeSettingsPath())),
      configure: async () => {
        const result = await mergeVscodeConfig(
          getVscodeSettingsPath(),
          SERVER_NAME,
          MCP_ENTRY_VSCODE
        )
        // Also install /handle skill
        const skillDir = join(home, ".copilot", "skills", "handle")
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_COPILOT_SKILL_MD)
        return result
      },
    },
    {
      id: "copilot-cli",
      name: "GitHub Copilot CLI",
      configPath: join(home, ".copilot", "mcp-config.json"),
      detect: () => exists(join(home, ".copilot")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".copilot", "mcp-config.json"),
          SERVER_NAME,
          MCP_ENTRY_COPILOT_CLI
        )
        // Also install /handle skill
        const skillDir = join(home, ".copilot", "skills", "handle")
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_COPILOT_SKILL_MD)
        return result
      },
    },
    {
      id: "gemini",
      name: "Gemini CLI",
      configPath: join(home, ".gemini", "settings.json"),
      detect: () => exists(join(home, ".gemini")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".gemini", "settings.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle custom command
        const cmdDir = join(home, ".gemini", "commands")
        const cmdPath = join(cmdDir, "handle.toml")
        await mkdir(cmdDir, { recursive: true })
        await writeFile(cmdPath, HANDLE_GEMINI_COMMAND)
        return result
      },
    },
    {
      id: "rovo-dev",
      name: "Rovo Dev",
      configPath: join(home, ".rovodev", "mcp.json"),
      detect: () => exists(join(home, ".rovodev")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".rovodev", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY_ROVODEV
        )
        // Also install /prompts handle
        const dir = join(home, ".rovodev")
        await mkdir(dir, { recursive: true })
        await mergeRovoDevPrompts(join(dir, "prompts.yml"))
        await writeFile(join(dir, "handle_prompt.md"), HANDLE_COMMAND)
        return result
      },
    },
    {
      id: "antigravity",
      name: "Antigravity",
      configPath: join(home, ".gemini", "antigravity", "mcp_config.json"),
      detect: () => exists(join(home, ".gemini", "antigravity")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".gemini", "antigravity", "mcp_config.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install handle skill
        const skillDir = join(home, ".gemini", "antigravity", "skills", "handle")
        await mkdir(skillDir, { recursive: true })
        await writeFile(join(skillDir, "SKILL.md"), HANDLE_CODEX_SKILL_MD)
        return result
      },
    },
    {
      id: "windsurf",
      name: "Windsurf",
      configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
      detect: () => exists(join(home, ".codeium", "windsurf")),
      configure: async () => {
        const result = await mergeConfig(
          join(home, ".codeium", "windsurf", "mcp_config.json"),
          SERVER_NAME,
          MCP_ENTRY
        )
        // Also install /handle workflow
        const wfDir = join(home, ".codeium", "windsurf", "global_workflows")
        const wfPath = join(wfDir, "handle.md")
        await mkdir(wfDir, { recursive: true })
        await writeFile(wfPath, HANDLE_COMMAND)
        return result
      },
    },
  )

  return agents
}
