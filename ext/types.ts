export interface HierarchyItem {
  tag: string
  id: string
  classes: string
  component: string | null
  selectorPath: string
}

export interface StyleData {
  fontFamily: string
  fontWeight: string
  fontSize: string
  padding: string
  display: string
  flexDirection?: string
  justifyContent?: string
  alignItems?: string
  justifyItems?: string
  gap?: string
  flexWrap?: string
  borderRadius: string
  backgroundColor: string
  borderColor: string
  borderWidth: string
  borderStyle: string
  textContent?: string
  [key: string]: string | undefined
}

export interface EditEntry {
  selector: string
  component: string | null
  componentPath: string | null
  props: Map<string, { original: string; current: string }>
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
