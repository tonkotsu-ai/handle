/**
 * Tests simulating the Chrome extension message flow between
 * content script, background script, and SidePanel.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { buildDomTree, buildSelectorPath } from "./dom"
import type { TreeNode } from "../types"

// Simulate the three extension components communicating
function createExtensionSimulation() {
  type MessageHandler = (message: any, sender: any, sendResponse: (r: any) => void) => boolean | void
  const bgListeners: MessageHandler[] = []
  const csListeners: MessageHandler[] = []
  const spListeners: MessageHandler[] = []
  const sentMessages: Array<{ from: string; to: string; message: any }> = []

  // Content script state
  let nodeMap = new Map<string, Node>()
  let pendingTarget: HTMLElement | null = null
  let active = false

  // SidePanel state
  let spTree: TreeNode | null = null
  let spSelectedNodeId: string | null = null
  let spSelectedPath: string[] | null = null
  let spExpandedNodes = new Set<string>()

  // Background: relay element-tree messages
  bgListeners.push((message, sender, sendResponse) => {
    if (message.type === "element-tree") {
      sentMessages.push({ from: "bg", to: "sp", message: { ...message, tabId: 1 } })
      // Simulate relay to SidePanel
      for (const handler of spListeners) {
        handler({ ...message, tabId: 1 }, {}, () => {})
      }
    }
    if (message.type === "annotate-react-tree") {
      // Simulate: annotate, then send react-tree-annotated
      sentMessages.push({ from: "bg", to: "cs", message: { type: "react-tree-annotated" } })
      for (const handler of csListeners) {
        handler({ type: "react-tree-annotated" }, {}, () => {})
      }
      return true
    }
    if (message.type === "annotate-react") {
      // Simulate: annotate target's ancestors, then send react-annotated
      sentMessages.push({ from: "bg", to: "cs", message: { type: "react-annotated" } })
      for (const handler of csListeners) {
        handler({ type: "react-annotated" }, {}, () => {})
      }
      return true
    }
  })

  // Helper: content script sends a runtime message
  function csSendMessage(message: any) {
    sentMessages.push({ from: "cs", to: "bg", message })
    for (const handler of bgListeners) {
      handler(message, { tab: { id: 1 } }, () => {})
    }
  }

  function rebuildTree(): TreeNode | null {
    const result = buildDomTree(document.body, {
      isOverlay: () => false,
      detectComponent: (el) =>
        el.getAttribute("data-handle-component") || null,
    })
    nodeMap = result.nodeMap
    return result.tree
  }

  function findNodeIdForElement(el: Node): string | null {
    for (const [nodeId, mappedEl] of nodeMap) {
      if (mappedEl === el) return nodeId
    }
    return null
  }

  function getAncestorPath(el: Node): string[] {
    const path: string[] = []
    let current: Node | null = el
    while (current && current !== document.documentElement) {
      for (const [nodeId, mappedEl] of nodeMap) {
        if (mappedEl === current) {
          path.unshift(nodeId)
          break
        }
      }
      current =
        current.nodeType === Node.ELEMENT_NODE
          ? (current as HTMLElement).parentElement
          : current.parentNode
    }
    return path
  }

  function sendTree(selectedNodeId?: string | null, selectedPath?: string[] | null) {
    const tree = rebuildTree()
    csSendMessage({
      type: "element-tree",
      tree,
      selectedNodeId: selectedNodeId || null,
      selectedPath: selectedPath || null,
    })
  }

  function handlePendingTarget() {
    if (!pendingTarget) return
    const el = pendingTarget
    pendingTarget = null
    const tree = rebuildTree()
    const sid = findNodeIdForElement(el)
    const sp = sid ? getAncestorPath(el) : null
    csSendMessage({
      type: "element-tree",
      tree,
      selectedNodeId: sid,
      selectedPath: sp,
    })
  }

  // Content script message handler
  csListeners.push((message) => {
    if (message.type === "enable-design-mode") {
      if (active) return
      active = true
      sendTree()
      csSendMessage({ type: "annotate-react-tree" })
    } else if (message.type === "react-tree-annotated") {
      sendTree()
    } else if (message.type === "react-annotated") {
      handlePendingTarget()
    }
  })

  // SidePanel message handler
  spListeners.push((message) => {
    if (message.type === "element-tree") {
      const tabId = 1 // simulate sidepanel tab
      if (tabId != null && message.tabId !== tabId) return
      spTree = message.tree
      spSelectedNodeId = message.selectedNodeId
      spSelectedPath = message.selectedPath
      if (spTree) {
        const expanded = new Set<string>()
        expanded.add(spTree.nodeId)
        for (const child of spTree.children) expanded.add(child.nodeId)
        if (message.selectedPath) {
          for (const nid of message.selectedPath) expanded.add(nid)
        }
        spExpandedNodes = expanded
      }
    }
  })

  return {
    // Actions
    enableDesignMode() {
      for (const handler of csListeners) {
        handler({ type: "enable-design-mode" }, {}, () => {})
      }
    },
    clickElement(el: HTMLElement) {
      el.setAttribute("data-handle-target", "")
      pendingTarget = el
      csSendMessage({ type: "annotate-react" })
    },
    // State accessors
    get spTree() { return spTree },
    get spSelectedNodeId() { return spSelectedNodeId },
    get spSelectedPath() { return spSelectedPath },
    get spExpandedNodes() { return spExpandedNodes },
    get sentMessages() { return sentMessages },
    get active() { return active },
  }
}

describe("extension message flow", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("enable-design-mode loads tree in SidePanel", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const ext = createExtensionSimulation()

    ext.enableDesignMode()

    // SidePanel should have the tree
    expect(ext.spTree).not.toBeNull()
    expect(ext.spTree!.tag).toBe("body")
    expect(ext.spTree!.children.length).toBe(1)
    expect(ext.spTree!.children[0].id).toBe("#app")

    // No selection on initial load
    expect(ext.spSelectedNodeId).toBeNull()
  })

  it("clicking element selects it in SidePanel", () => {
    document.body.innerHTML =
      '<div id="app"><h1 class="title">Hello</h1><p>World</p></div>'
    const ext = createExtensionSimulation()

    ext.enableDesignMode()

    // Tree loaded, no selection
    expect(ext.spTree).not.toBeNull()
    expect(ext.spSelectedNodeId).toBeNull()

    // Click h1
    const h1 = document.querySelector("h1")!
    ext.clickElement(h1 as HTMLElement)

    // SidePanel should have the tree with h1 selected
    expect(ext.spTree).not.toBeNull()
    expect(ext.spSelectedNodeId).not.toBeNull()

    // Find the selected node in the tree
    function findNode(t: TreeNode, nid: string): TreeNode | null {
      if (t.nodeId === nid) return t
      for (const child of t.children) {
        const found = findNode(child, nid)
        if (found) return found
      }
      return null
    }

    const selectedNode = findNode(ext.spTree!, ext.spSelectedNodeId!)
    expect(selectedNode).not.toBeNull()
    expect(selectedNode!.tag).toBe("h1")
    expect(selectedNode!.classes).toBe(".title")
  })

  it("selectedPath includes all ancestors", () => {
    document.body.innerHTML =
      '<div id="app"><main><section><h1>Hello</h1></section></main></div>'
    const ext = createExtensionSimulation()
    ext.enableDesignMode()

    const h1 = document.querySelector("h1")!
    ext.clickElement(h1 as HTMLElement)

    expect(ext.spSelectedPath).not.toBeNull()
    // Path should be: body, div#app, main, section, h1
    expect(ext.spSelectedPath!.length).toBe(5)
  })

  it("tree nodes are expanded to show selected element", () => {
    document.body.innerHTML =
      '<div id="app"><main><h1>Hello</h1></main></div>'
    const ext = createExtensionSimulation()
    ext.enableDesignMode()

    const h1 = document.querySelector("h1")!
    ext.clickElement(h1 as HTMLElement)

    // All ancestors should be expanded
    for (const nid of ext.spSelectedPath!) {
      expect(ext.spExpandedNodes.has(nid)).toBe(true)
    }
  })

  it("message flow: enable → tree → annotate → tree (with components)", () => {
    document.body.innerHTML =
      '<div data-handle-component="App"><h1>Hello</h1></div>'
    const ext = createExtensionSimulation()
    ext.enableDesignMode()

    // Should see at least 2 element-tree messages:
    // 1. From sendTree() called directly in enable()
    // 2. From sendTree() called in react-tree-annotated handler
    const treeMsgs = ext.sentMessages.filter(
      (m) => m.message.type === "element-tree",
    )
    expect(treeMsgs.length).toBeGreaterThanOrEqual(2)

    // Both trees should have the App component
    for (const msg of treeMsgs) {
      expect(msg.message.tree).not.toBeNull()
      expect(msg.message.tree.children[0].component).toBe("App")
    }
  })
})
