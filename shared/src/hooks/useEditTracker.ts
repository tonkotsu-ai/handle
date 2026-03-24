import { useRef, useState } from "react"

import type { EditEntry, ElementId } from "../types"

export interface ElementMeta {
  selector: string
  component: string | null
  componentPath: string | null
}

export interface UseEditTrackerOptions {
  /** Resolve an elementId to a stable selector path string for keying edits */
  resolvePath: (elementId: ElementId) => string | undefined
  /** Resolve element metadata (selector label, component owner, component path) */
  resolveElementMeta: (elementId: ElementId) => ElementMeta
}

export interface EditTracker {
  editsRef: React.RefObject<Map<string, EditEntry>>
  changeCount: number
  editRevision: number
  recordEdit: (elementId: ElementId, prop: string, original: string, value: string, tokenName?: string) => void
  recomputeChangeCount: () => void
  hasEditsForElement: (elementId: ElementId) => boolean
  getEditedPropsForElement: (elementId: ElementId) => Map<string, { original: string; current: string; tokenName?: string }>
  generateFeedbackDescription: () => string
  resetEdits: () => void
}

export function useEditTracker(options: UseEditTrackerOptions): EditTracker {
  const { resolvePath, resolveElementMeta } = options

  const editsRef = useRef<Map<string, EditEntry>>(new Map())
  const [changeCount, setChangeCount] = useState(0)
  const [editRevision, setEditRevision] = useState(0)

  function recomputeChangeCount() {
    let count = 0
    for (const [, entry] of editsRef.current) {
      for (const [, { original, current }] of entry.props) {
        if (original !== current) count++
      }
    }
    setChangeCount(count)
    setEditRevision((r) => r + 1)
  }

  function hasEditsForElement(elementId: ElementId): boolean {
    const path = resolvePath(elementId)
    if (!path) return false
    const entry = editsRef.current.get(path)
    if (!entry) return false
    for (const [, { original, current }] of entry.props) {
      if (original !== current) return true
    }
    return false
  }

  function getEditedPropsForElement(
    elementId: ElementId
  ): Map<string, { original: string; current: string; tokenName?: string }> {
    const path = resolvePath(elementId)
    if (!path) return new Map()
    const entry = editsRef.current.get(path)
    if (!entry) return new Map()
    const result = new Map<string, { original: string; current: string; tokenName?: string }>()
    for (const [prop, { original, current, tokenName }] of entry.props) {
      if (original !== current) result.set(prop, { original, current, tokenName })
    }
    return result
  }

  function recordEdit(
    elementId: ElementId,
    prop: string,
    originalValue: string,
    newValue: string,
    tokenName?: string
  ) {
    const selectorPath = resolvePath(elementId)
    const path = selectorPath || `element[${elementId}]`
    if (!editsRef.current.has(path)) {
      const meta = resolveElementMeta(elementId)
      editsRef.current.set(path, {
        selector: meta.selector,
        component: meta.component,
        componentPath: meta.componentPath,
        props: new Map()
      })
    }
    const entry = editsRef.current.get(path)!
    if (!entry.props.has(prop)) {
      entry.props.set(prop, { original: originalValue, current: newValue, tokenName })
    } else {
      const propEntry = entry.props.get(prop)!
      propEntry.current = newValue
      propEntry.tokenName = tokenName
    }
  }

  function generateFeedbackDescription(): string {
    const byComponent = new Map<
      string,
      {
        selectorPath: string
        changes: { prop: string; from: string; to: string }[]
      }[]
    >()
    for (const [selectorPath, entry] of editsRef.current) {
      const changedProps: { prop: string; from: string; to: string }[] = []
      for (const [prop, { original, current, tokenName }] of entry.props) {
        if (original !== current) {
          const displayValue = tokenName
            ? (tokenName.startsWith("--") ? `var(${tokenName})` : tokenName)
            : current
          changedProps.push({ prop, from: original, to: displayValue })
        }
      }
      if (changedProps.length === 0) continue
      const key = entry.component || "(no component)"
      if (!byComponent.has(key)) byComponent.set(key, [])
      byComponent.get(key)!.push({ selectorPath, changes: changedProps })
    }

    if (byComponent.size === 0) return "No feedback given"

    const lines: string[] = []
    for (const [component, elements] of byComponent) {
      lines.push(
        `In ${component === "(no component)" ? "unowned elements" : component}:`
      )
      for (const { selectorPath, changes } of elements) {
        for (const { prop, from, to } of changes) {
          lines.push(
            `  - On ${selectorPath}: change ${prop} from "${from}" to "${to}"`
          )
        }
      }
    }
    return lines.join("\n")
  }

  function resetEdits() {
    editsRef.current = new Map()
    setChangeCount(0)
    setEditRevision((r) => r + 1)
  }

  return {
    editsRef,
    changeCount,
    editRevision,
    recordEdit,
    recomputeChangeCount,
    hasEditsForElement,
    getEditedPropsForElement,
    generateFeedbackDescription,
    resetEdits,
  }
}
