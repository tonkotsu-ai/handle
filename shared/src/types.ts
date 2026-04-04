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
  margin: string
  paddingTop?: string
  paddingRight?: string
  paddingBottom?: string
  paddingLeft?: string
  marginTop?: string
  marginRight?: string
  marginBottom?: string
  marginLeft?: string
  borderTopWidth?: string
  borderRightWidth?: string
  borderBottomWidth?: string
  borderLeftWidth?: string
  display: string
  flexDirection?: string
  justifyContent?: string
  alignItems?: string
  justifyItems?: string
  gap?: string
  columnGap?: string
  rowGap?: string
  gridTemplateColumns?: string
  gridTemplateRows?: string
  gridAutoFlow?: string
  flexWrap?: string
  borderRadius: string
  backgroundColor: string
  borderColor: string
  borderWidth: string
  borderStyle: string
  width?: string
  height?: string
  widthComputed?: string
  heightComputed?: string
  textContent?: string
  [key: string]: string | undefined
}

export interface EditEntry {
  selector: string
  component: string | null
  componentPath: string | null
  props: Map<string, { original: string; current: string; tokenName?: string }>
}

export interface ElementItem {
  tag: string
  id: string
  classes: string
  component: string | null
  childCount?: number
  selectorPath?: string
  hidden?: boolean
  textContent?: string
}

export interface TreeNode {
  nodeId: string
  tag: string
  id: string
  classes: string
  component: string | null
  childCount: number
  children: TreeNode[]
  selectorPath?: string
  hidden?: boolean
  textContent?: string
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
