import { homedir, platform } from "os"
import { join, dirname } from "path"
import { readFile, writeFile, mkdir, access } from "fs/promises"
import { constants } from "fs"

const SERVER_NAME = "handle"

const MCP_ENTRY = {
  command: "npx",
  args: ["-y", "handle-design@latest"],
}

const HANDLE_COMMAND = `Call the handle MCP's get_design_feedback tool to receive visual design feedback from the browser extension. After receiving the feedback, implement the requested changes.
`

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
    existing = JSON.parse(raw)
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
      id: "cursor",
      name: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      detect: () => exists(join(home, ".cursor")),
      configure: () =>
        mergeConfig(
          join(home, ".cursor", "mcp.json"),
          SERVER_NAME,
          MCP_ENTRY
        ),
    },
    {
      id: "windsurf",
      name: "Windsurf",
      configPath: join(home, ".codeium", "windsurf", "mcp_config.json"),
      detect: () => exists(join(home, ".codeium", "windsurf")),
      configure: () =>
        mergeConfig(
          join(home, ".codeium", "windsurf", "mcp_config.json"),
          SERVER_NAME,
          MCP_ENTRY
        ),
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

  return agents
}
