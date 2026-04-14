/**
 * Real integration test: renders the actual SidePanel component with
 * mocked Chrome APIs, dispatches an element-tree message, and verifies
 * the DOM tree renders in the panel.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { render, screen, act, cleanup } from "@testing-library/react"
import React from "react"
import type { TreeNode } from "../types"

// ---------------------------------------------------------------------------
// Mock browser APIs not available in jsdom
// ---------------------------------------------------------------------------
Element.prototype.scrollIntoView = vi.fn()

// ---------------------------------------------------------------------------
// Mock Chrome APIs before importing any extension code
// ---------------------------------------------------------------------------
const messageListeners: Array<(message: any) => void> = []
const chromeMock = {
  runtime: {
    onMessage: {
      addListener: vi.fn((fn: any) => messageListeners.push(fn)),
      removeListener: vi.fn((fn: any) => {
        const idx = messageListeners.indexOf(fn)
        if (idx >= 0) messageListeners.splice(idx, 1)
      }),
    },
    sendMessage: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(() => ({
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    })),
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([{ id: 42 }]),
  },
  sidePanel: {
    setOptions: vi.fn(),
    open: vi.fn().mockResolvedValue(undefined),
  },
}
;(globalThis as any).chrome = chromeMock

// Mock window.location.search for tabId
Object.defineProperty(window, "location", {
  writable: true,
  value: { ...window.location, search: "?tabId=42", href: "chrome-extension://test/sidepanel.html?tabId=42" },
})

// Now dynamically import SidePanel (it reads chrome.* at module level)
let SidePanel: React.FC<{ demo?: boolean }>

// Sample tree that buildDomTree would produce
const SAMPLE_TREE: TreeNode = {
  nodeId: "0",
  tag: "body",
  id: "",
  classes: "",
  component: null,
  childCount: 1,
  children: [
    {
      nodeId: "1",
      tag: "div",
      id: "#app",
      classes: ".min-h-screen",
      component: "App",
      childCount: 1,
      children: [
        {
          nodeId: "2",
          tag: "h1",
          id: "",
          classes: ".text-lg",
          component: null,
          childCount: 1,
          children: [
            {
              nodeId: "3",
              tag: "#text",
              id: "",
              classes: "",
              component: null,
              childCount: 0,
              children: [],
              textContent: "Hello World",
            },
          ],
          selectorPath: "body > div#app > h1.text-lg",
        },
      ],
      selectorPath: "body > div#app",
    },
  ],
  selectorPath: "body",
}

describe("SidePanel element-tree message handling", () => {
  beforeEach(async () => {
    messageListeners.length = 0
    vi.clearAllMocks()

    // Dynamic import to ensure chrome mock is in place
    const mod = await import("../../../ext/components/SidePanel")
    SidePanel = mod.default
  })

  afterEach(() => {
    cleanup()
  })

  it("renders empty state when no tree", () => {
    render(<SidePanel />)
    expect(screen.getByText("Select an element on the page")).toBeTruthy()
  })

  it("renders tree after receiving element-tree message", async () => {
    render(<SidePanel />)

    // The SidePanel should have registered a chrome.runtime.onMessage listener
    expect(messageListeners.length).toBeGreaterThan(0)

    // Simulate receiving a relayed element-tree message (with tabId)
    await act(async () => {
      for (const listener of messageListeners) {
        listener({
          type: "element-tree",
          tree: SAMPLE_TREE,
          selectedNodeId: null,
          selectedPath: null,
          tabId: 42,
        })
      }
    })

    // The tree should now be rendered — body, div#app, h1 should be visible
    // (depth 0 and 1 are auto-expanded)
    expect(screen.getByText("body")).toBeTruthy()
    expect(screen.getByText("App")).toBeTruthy() // Component name for div#app
  })

  it("renders tree with selected element after click", async () => {
    render(<SidePanel />)

    // Mock get-styles response for the selected element
    chromeMock.tabs.sendMessage.mockResolvedValueOnce(undefined) // highlight
    chromeMock.tabs.sendMessage.mockResolvedValueOnce(undefined) // show-measurements
    chromeMock.tabs.sendMessage.mockResolvedValueOnce({
      styles: {
        display: "block",
        padding: "0px",
        fontFamily: "sans-serif",
        fontWeight: "400",
        fontSize: "16px",
        borderRadius: "0px",
        backgroundColor: "transparent",
        borderColor: "transparent",
        borderWidth: "0px",
        borderStyle: "none",
      },
      selectorPath: "body > div#app > h1.text-lg",
    })

    await act(async () => {
      for (const listener of messageListeners) {
        listener({
          type: "element-tree",
          tree: SAMPLE_TREE,
          selectedNodeId: "2", // h1
          selectedPath: ["0", "1", "2"],
          tabId: 42,
        })
      }
    })

    // Tree should be rendered
    expect(screen.getByText("body")).toBeTruthy()

    // h1 should be visible (ancestors expanded via selectedPath)
    expect(screen.getByText("h1")).toBeTruthy()

    // Selected element should trigger highlight, show-measurements, and get-styles messages
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: "highlight-element",
      nodeId: "2",
    })
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: "show-measurements",
      nodeId: "2",
    })
  })

  it("sends show-measurements when element-tree arrives with selection", async () => {
    render(<SidePanel />)

    chromeMock.tabs.sendMessage.mockResolvedValue(undefined)

    await act(async () => {
      for (const listener of messageListeners) {
        listener({
          type: "element-tree",
          tree: SAMPLE_TREE,
          selectedNodeId: "1", // div#app
          selectedPath: ["0", "1"],
          tabId: 42,
        })
      }
    })

    const calls = chromeMock.tabs.sendMessage.mock.calls
    const measureCalls = calls.filter(
      ([, msg]: any) => msg.type === "show-measurements",
    )
    expect(measureCalls.length).toBe(1)
    expect(measureCalls[0]).toEqual([42, { type: "show-measurements", nodeId: "1" }])
  })

  it("element-tree message without tabId is filtered out", async () => {
    render(<SidePanel />)

    // Send element-tree WITHOUT tabId (like direct from content script, not relayed)
    await act(async () => {
      for (const listener of messageListeners) {
        listener({
          type: "element-tree",
          tree: SAMPLE_TREE,
          selectedNodeId: null,
          selectedPath: null,
          // no tabId!
        })
      }
    })

    // Tree should NOT be rendered (message filtered out)
    expect(screen.getByText("Select an element on the page")).toBeTruthy()
  })

  it("demo mode renders tree immediately without Chrome messages", () => {
    render(<SidePanel demo />)

    // Demo mode should show the demo tree, not the empty state
    expect(screen.queryByText("Select an element on the page")).toBeNull()
    // Should show body in the demo tree
    expect(screen.getByText("body")).toBeTruthy()
  })
})
