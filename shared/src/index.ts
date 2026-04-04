// Types
export type {
  ElementId,
  RGBA,
  StyleData,
  EditEntry,
  ElementItem,
  TreeNode,
  TokenEntry,
  RefineTransport,
} from "./types"

// DOM utilities
export {
  buildSelectorSegment,
  buildSelectorPath,
  buildDomTree,
  detectComponent,
  hasFrameworkMarkers,
  isElementVisible,
  visibleElementAtPoint,
  createMeasurementOverlays,
  updateMeasurementPositions,
  clearMeasurementOverlays,
  buildSelectorSegmentSnippet,
  buildSelectorPathSnippet,
  buildDomTreeSnippet,
  detectComponentSnippet,
  hasFrameworkMarkersSnippet,
  visibleElementAtPointSnippet,
  measurementOverlaySnippet,
} from "./utils/dom"
export type { BuildDomTreeOptions } from "./utils/dom"

// Color utilities
export {
  parseColor,
  hexToRgba,
  rgbaToHex,
  rgbaToHex6,
  rgbaToString,
  formatColor,
  normalizeToHex,
  normalizeToHex6,
  rgbaToHsv,
  hsvToRgba,
  getOpacity,
  withOpacity,
} from "./utils/color"
export type { HSV } from "./utils/color"

// Components
export { default as ColorPicker } from "./components/ColorPicker"
export type { ColorPickerProps } from "./components/ColorPicker"
export { default as IconPicker, toKebab, getIconSvgChildren } from "./components/IconPicker"
export { default as StyleEditor } from "./components/StyleEditor"
export type { StyleEditorProps } from "./components/StyleEditor"
export { default as ElementRow } from "./components/ElementRow"
export type { ElementRowProps } from "./components/ElementRow"

// Hooks
export { useEditTracker } from "./hooks/useEditTracker"
export type { EditTracker, UseEditTrackerOptions, ElementMeta } from "./hooks/useEditTracker"
