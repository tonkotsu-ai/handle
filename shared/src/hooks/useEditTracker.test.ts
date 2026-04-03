import { describe, it, expect, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useEditTracker } from "./useEditTracker"
import type { UseEditTrackerOptions, ElementMeta } from "./useEditTracker"

function createOptions(overrides?: Partial<UseEditTrackerOptions>): UseEditTrackerOptions {
  const paths = new Map<string, string>([
    ["1", "body > div#app > h1"],
    ["2", "body > div#app > p"],
    ["3", "body > div#app > span"],
  ])
  const metas = new Map<string, ElementMeta>([
    ["1", { selector: "h1", component: "Header", componentPath: "/src/Header.tsx" }],
    ["2", { selector: "p", component: "Content", componentPath: "/src/Content.tsx" }],
    ["3", { selector: "span", component: null, componentPath: null }],
  ])
  return {
    resolvePath: (id) => paths.get(String(id)),
    resolveElementMeta: (id) => metas.get(String(id)) ?? { selector: "", component: null, componentPath: null },
    ...overrides,
  }
}

describe("useEditTracker", () => {
  it("starts with zero changes", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    expect(result.current.changeCount).toBe(0)
    expect(result.current.editsRef.current.size).toBe(0)
  })

  it("recordEdit adds an entry", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
    })
    expect(result.current.editsRef.current.size).toBe(1)
    const entry = result.current.editsRef.current.get("body > div#app > h1")!
    expect(entry.selector).toBe("h1")
    expect(entry.component).toBe("Header")
    expect(entry.props.get("fontSize")).toEqual({
      original: "16px",
      current: "20px",
      tokenName: undefined,
    })
  })

  it("recordEdit updates existing prop", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
      result.current.recordEdit("1", "fontSize", "16px", "24px")
    })
    const entry = result.current.editsRef.current.get("body > div#app > h1")!
    expect(entry.props.get("fontSize")!.current).toBe("24px")
    expect(entry.props.get("fontSize")!.original).toBe("16px")
  })

  it("recordEdit preserves tokenName", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "color", "red", "blue", "--primary")
    })
    const entry = result.current.editsRef.current.get("body > div#app > h1")!
    expect(entry.props.get("color")!.tokenName).toBe("--primary")
  })

  it("recomputeChangeCount counts changed props", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
      result.current.recordEdit("1", "color", "red", "blue")
      result.current.recordEdit("2", "padding", "8px", "16px")
      result.current.recomputeChangeCount()
    })
    expect(result.current.changeCount).toBe(3)
  })

  it("recomputeChangeCount ignores reverted props", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "16px")
      result.current.recomputeChangeCount()
    })
    expect(result.current.changeCount).toBe(0)
  })

  it("hasEditsForElement returns true when element has changed props", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
    })
    expect(result.current.hasEditsForElement("1")).toBe(true)
    expect(result.current.hasEditsForElement("2")).toBe(false)
  })

  it("hasEditsForElement returns false for reverted edits", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "16px")
    })
    expect(result.current.hasEditsForElement("1")).toBe(false)
  })

  it("hasEditsForElement returns false for unknown element", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    expect(result.current.hasEditsForElement("999")).toBe(false)
  })

  it("getEditedPropsForElement returns only changed props", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
      result.current.recordEdit("1", "color", "red", "red") // reverted
      result.current.recordEdit("1", "padding", "8px", "16px")
    })
    const props = result.current.getEditedPropsForElement("1")
    expect(props.size).toBe(2)
    expect(props.has("fontSize")).toBe(true)
    expect(props.has("padding")).toBe(true)
    expect(props.has("color")).toBe(false)
  })

  it("getEditedPropsForElement returns empty map for unknown element", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    expect(result.current.getEditedPropsForElement("999").size).toBe(0)
  })

  it("generateFeedbackDescription groups by component", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
      result.current.recordEdit("2", "padding", "8px", "16px")
    })
    const desc = result.current.generateFeedbackDescription()
    expect(desc).toContain("In Header:")
    expect(desc).toContain("In Content:")
    expect(desc).toContain('change fontSize from "16px" to "20px"')
    expect(desc).toContain('change padding from "8px" to "16px"')
  })

  it("generateFeedbackDescription uses 'unowned elements' when no component", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("3", "color", "red", "blue")
    })
    const desc = result.current.generateFeedbackDescription()
    expect(desc).toContain("In unowned elements:")
  })

  it("generateFeedbackDescription shows token name with var()", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "color", "red", "blue", "--primary")
    })
    const desc = result.current.generateFeedbackDescription()
    expect(desc).toContain("var(--primary)")
  })

  it("generateFeedbackDescription returns fallback when no changes", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    expect(result.current.generateFeedbackDescription()).toBe("No feedback given")
  })

  it("resetEdits clears all state", () => {
    const { result } = renderHook(() => useEditTracker(createOptions()))
    act(() => {
      result.current.recordEdit("1", "fontSize", "16px", "20px")
      result.current.recomputeChangeCount()
    })
    expect(result.current.changeCount).toBe(1)
    act(() => {
      result.current.resetEdits()
    })
    expect(result.current.changeCount).toBe(0)
    expect(result.current.editsRef.current.size).toBe(0)
  })

  it("recordEdit falls back to element[id] when path not resolvable", () => {
    const options = createOptions({
      resolvePath: () => undefined,
    })
    const { result } = renderHook(() => useEditTracker(options))
    act(() => {
      result.current.recordEdit("999", "color", "red", "blue")
    })
    expect(result.current.editsRef.current.has("element[999]")).toBe(true)
  })
})
