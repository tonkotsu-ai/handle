/**
 * Integration tests that simulate the Chrome extension content script's
 * tree-building and element-selection flow using the shared buildDomTree.
 */
import { describe, it, expect, beforeEach } from "vitest"
import { buildDomTree, buildSelectorPath } from "./dom"
import type { TreeNode } from "../types"

// Simulate the content script's state and functions
function createContentScriptSimulation() {
  let nodeMap = new Map<string, Node>()
  const elementCache = new Map<string, HTMLElement>()

  function rebuildTree(): TreeNode | null {
    const result = buildDomTree(document.body, {
      isOverlay: () => false,
      detectComponent: (el) =>
        el.getAttribute("data-handle-component") || null,
    })
    nodeMap = result.nodeMap
    for (const [, node] of nodeMap) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const sp = buildSelectorPath(el)
        elementCache.set(sp, el)
      }
    }
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

  function getStyles(nodeId: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return null
    if (node.nodeType === Node.TEXT_NODE) {
      const parentEl = node.parentElement
      return {
        styles: { textContent: node.textContent || "" },
        selectorPath: parentEl
          ? buildSelectorPath(parentEl) +
            "/#text(" +
            Array.from(parentEl.childNodes).indexOf(node as ChildNode) +
            ")"
          : "",
      }
    }
    const el = node as HTMLElement
    return {
      styles: { display: "block" },
      selectorPath: buildSelectorPath(el),
    }
  }

  return {
    rebuildTree,
    findNodeIdForElement,
    getAncestorPath,
    getStyles,
    get nodeMap() {
      return nodeMap
    },
    elementCache,
  }
}

describe("content script tree + selection flow", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("rebuildTree creates tree and populates nodeMap", () => {
    document.body.innerHTML =
      '<div id="app"><h1>Hello</h1><p>World</p></div>'
    const cs = createContentScriptSimulation()
    const tree = cs.rebuildTree()

    expect(tree).not.toBeNull()
    expect(tree!.tag).toBe("body")
    expect(cs.nodeMap.size).toBeGreaterThan(0)
  })

  it("findNodeIdForElement finds clicked element after rebuildTree", () => {
    document.body.innerHTML =
      '<div id="app"><h1>Hello</h1><p>World</p></div>'
    const cs = createContentScriptSimulation()
    cs.rebuildTree()

    const h1 = document.querySelector("h1")!
    const nodeId = cs.findNodeIdForElement(h1)
    expect(nodeId).not.toBeNull()

    // Verify the nodeMap maps back to the same element
    expect(cs.nodeMap.get(nodeId!)).toBe(h1)
  })

  it("getAncestorPath returns path from root to element", () => {
    document.body.innerHTML =
      '<div id="app"><main><h1>Hello</h1></main></div>'
    const cs = createContentScriptSimulation()
    const tree = cs.rebuildTree()

    const h1 = document.querySelector("h1")!
    const path = cs.getAncestorPath(h1)

    // Path should include body, div#app, main, h1
    expect(path.length).toBe(4)
    // First should be body (nodeId "0")
    expect(path[0]).toBe(tree!.nodeId)
    // Last should be h1's nodeId
    const h1NodeId = cs.findNodeIdForElement(h1)
    expect(path[path.length - 1]).toBe(h1NodeId)
  })

  it("simulates full click→select flow", () => {
    document.body.innerHTML =
      '<div id="app"><main><h1 class="title">Hello</h1><p>World</p></main></div>'
    const cs = createContentScriptSimulation()

    // Simulate: user clicks h1
    const clickedEl = document.querySelector("h1")!

    // Content script builds tree and finds the clicked element
    const tree = cs.rebuildTree()
    const selectedNodeId = cs.findNodeIdForElement(clickedEl)
    const selectedPath = selectedNodeId
      ? cs.getAncestorPath(clickedEl)
      : null

    expect(tree).not.toBeNull()
    expect(selectedNodeId).not.toBeNull()
    expect(selectedPath).not.toBeNull()

    // Simulate: message sent to SidePanel
    const message = {
      type: "element-tree",
      tree,
      selectedNodeId,
      selectedPath,
    }

    // SidePanel can find the selected node in the tree
    function findNode(t: TreeNode, nid: string): TreeNode | null {
      if (t.nodeId === nid) return t
      for (const child of t.children) {
        const found = findNode(child, nid)
        if (found) return found
      }
      return null
    }

    const selectedNode = findNode(message.tree!, message.selectedNodeId!)
    expect(selectedNode).not.toBeNull()
    expect(selectedNode!.tag).toBe("h1")
    expect(selectedNode!.classes).toBe(".title")
  })

  it("getStyles returns styles and selectorPath for element nodeId", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const cs = createContentScriptSimulation()
    cs.rebuildTree()

    const h1 = document.querySelector("h1")!
    const nodeId = cs.findNodeIdForElement(h1)!
    const result = cs.getStyles(nodeId)

    expect(result).not.toBeNull()
    expect(result!.selectorPath).toBe("body > div#app > h1")
    expect(result!.styles).toBeDefined()
  })

  it("getStyles returns styles for text node", () => {
    document.body.innerHTML = "<p>Hello World</p>"
    const cs = createContentScriptSimulation()
    const tree = cs.rebuildTree()

    // Find the text node in the tree
    const p = tree!.children[0]
    const textNode = p.children[0]
    expect(textNode.tag).toBe("#text")

    const result = cs.getStyles(textNode.nodeId)
    expect(result).not.toBeNull()
    expect(result!.styles.textContent).toBe("Hello World")
    expect(result!.selectorPath).toContain("#text(")
  })

  it("elementCache is populated with selectorPath→element mappings", () => {
    document.body.innerHTML =
      '<div id="app"><h1>Hello</h1><p>World</p></div>'
    const cs = createContentScriptSimulation()
    cs.rebuildTree()

    // All elements should be in the cache
    expect(cs.elementCache.has("body")).toBe(true)
    expect(cs.elementCache.has("body > div#app")).toBe(true)
    expect(cs.elementCache.has("body > div#app > h1")).toBe(true)
    expect(cs.elementCache.has("body > div#app > p")).toBe(true)

    // Cache values should point to actual DOM elements
    expect(cs.elementCache.get("body > div#app > h1")).toBe(
      document.querySelector("h1"),
    )
  })

  it("select-by-selector: elementCache allows re-finding elements", () => {
    document.body.innerHTML =
      '<div id="app"><h1 class="title">Hello</h1></div>'
    const cs = createContentScriptSimulation()
    cs.rebuildTree()

    // Simulate select-by-selector from Changes tab
    const selectorPath = "body > div#app > h1.title"
    const el = cs.elementCache.get(selectorPath)
    expect(el).toBeDefined()
    expect(el).toBe(document.querySelector("h1"))
  })

  it("tree rebuilt after navigation has fresh nodeIds", () => {
    document.body.innerHTML = '<div id="page1"><h1>Page 1</h1></div>'
    const cs = createContentScriptSimulation()
    const tree1 = cs.rebuildTree()

    const h1_id = cs.findNodeIdForElement(document.querySelector("h1")!)

    // Simulate SPA navigation — new content
    document.body.innerHTML = '<div id="page2"><h2>Page 2</h2></div>'
    const tree2 = cs.rebuildTree()

    // New tree has new nodeIds starting from 0
    expect(tree2!.nodeId).toBe("0")
    // Old nodeId now maps to a different element (nodeIds restart from 0)
    const oldElement = cs.nodeMap.get(h1_id!)
    // h1 no longer exists in the new DOM
    if (oldElement) {
      expect(oldElement).not.toBe(document.querySelector("h1"))
    }

    // New h2 should be findable
    const h2 = document.querySelector("h2")!
    const h2Id = cs.findNodeIdForElement(h2)
    expect(h2Id).not.toBeNull()
  })

  it("component detection via data-handle-component attribute", () => {
    document.body.innerHTML =
      '<div data-handle-component="App"><div data-handle-component="Header"><h1>Title</h1></div></div>'
    const cs = createContentScriptSimulation()
    const tree = cs.rebuildTree()

    const appDiv = tree!.children[0]
    expect(appDiv.component).toBe("App")

    const headerDiv = appDiv.children[0]
    expect(headerDiv.component).toBe("Header")

    const h1 = headerDiv.children[0]
    expect(h1.component).toBeNull()
  })
})
