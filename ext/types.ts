import type { EditEntry, StyleData } from "@handle-ai/handle-shared"
export type { EditEntry, StyleData }
export type { TreeNode } from "@handle-ai/handle-shared"

export interface SessionInfo {
  id: string
  port: number
  pid: number
  agentName?: string
  repo: string
  startedAt: string
  context?: string
}
