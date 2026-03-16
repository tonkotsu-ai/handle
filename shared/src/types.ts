export type ElementId = string | number

export interface RGBA {
  r: number // 0-255
  g: number // 0-255
  b: number // 0-255
  a: number // 0-1
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

export interface ElementItem {
  tag: string
  id: string
  classes: string
  component: string | null
  childCount?: number
  selectorPath?: string
}

export interface TokenEntry {
  name: string
  value: string
}

export interface RefineTransport {
  setStyle(elementId: ElementId, prop: string, value: string): void
  setText(elementId: ElementId, value: string): void
  setIcon(elementId: ElementId, name: string, svgChildren: string): void
}
