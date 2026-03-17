import type { EditEntry, StyleData } from "@handle-ai/handle-shared"
export type { EditEntry, StyleData }

export interface HierarchyItem {
  tag: string
  id: string
  classes: string
  component: string | null
  selectorPath: string
  hidden?: boolean
  hiddenSiblings?: HierarchyItem[]
}

export interface SessionInfo {
  id: string
  port: number
  pid: number
  agentName?: string
  repo: string
  startedAt: string
  context?: string
}
