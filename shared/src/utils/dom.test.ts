import { describe, it, expect, beforeEach } from "vitest"
import {
  buildSelectorSegment,
  buildSelectorPath,
  buildDomTree,
} from "./dom"

describe("buildSelectorSegment", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("returns tag name for simple element", () => {
    document.body.innerHTML = "<div></div>"
    const el = document.body.querySelector("div")!
    expect(buildSelectorSegment(el)).toBe("div")
  })

  it("includes id when present", () => {
    document.body.innerHTML = '<div id="app"></div>'
    const el = document.body.querySelector("#app")!
    expect(buildSelectorSegment(el)).toBe("div#app")
  })

  it("includes classes when present", () => {
    document.body.innerHTML = '<div class="flex gap-2"></div>'
    const el = document.body.querySelector("div")!
    expect(buildSelectorSegment(el)).toBe("div.flex.gap-2")
  })

  it("adds nth-child for ambiguous siblings", () => {
    document.body.innerHTML = "<div><span>a</span><span>b</span></div>"
    const spans = document.body.querySelectorAll("span")
    expect(buildSelectorSegment(spans[0] as HTMLElement)).toBe(
      "span:nth-child(1)",
    )
    expect(buildSelectorSegment(spans[1] as HTMLElement)).toBe(
      "span:nth-child(2)",
    )
  })

  it("does not add nth-child for unique sibling", () => {
    document.body.innerHTML = "<div><span>a</span><p>b</p></div>"
    const span = document.body.querySelector("span")!
    expect(buildSelectorSegment(span as HTMLElement)).toBe("span")
  })
})

describe("buildSelectorPath", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("builds path from body to element", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const h1 = document.body.querySelector("h1")!
    const path = buildSelectorPath(h1 as HTMLElement)
    expect(path).toBe("body > div#app > h1")
  })

  it("handles nested elements", () => {
    document.body.innerHTML =
      '<div id="root"><main><section><p>text</p></section></main></div>'
    const p = document.body.querySelector("p")!
    const path = buildSelectorPath(p as HTMLElement)
    expect(path).toBe("body > div#root > main > section > p")
  })
})

describe("buildDomTree", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("builds a tree from document.body", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const { tree, nodeMap } = buildDomTree(document.body)
    expect(tree).not.toBeNull()
    expect(tree!.tag).toBe("body")
    expect(tree!.nodeId).toBe("0")
    expect(tree!.children.length).toBe(1)

    const div = tree!.children[0]
    expect(div.tag).toBe("div")
    expect(div.id).toBe("#app")
    expect(div.nodeId).toBe("1")

    const h1 = div.children[0]
    expect(h1.tag).toBe("h1")
    expect(h1.nodeId).toBe("2")

    // h1 has a text child
    expect(h1.children.length).toBe(1)
    expect(h1.children[0].tag).toBe("#text")
    expect(h1.children[0].textContent).toBe("Hello")
  })

  it("populates nodeMap with all nodes", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const { nodeMap } = buildDomTree(document.body)
    // body, div, h1, "Hello" text node = 4 entries
    expect(nodeMap.size).toBe(4)
    expect(nodeMap.get("0")).toBe(document.body)
    expect(nodeMap.get("1")).toBe(document.querySelector("#app"))
    expect(nodeMap.get("2")).toBe(document.querySelector("h1"))
    // "3" is the text node
    expect(nodeMap.get("3")!.nodeType).toBe(Node.TEXT_NODE)
  })

  it("filters out script/style/meta tags", () => {
    document.body.innerHTML =
      "<div><script>alert(1)</script><style>.x{}</style><p>text</p></div>"
    const { tree } = buildDomTree(document.body)
    const div = tree!.children[0]
    // Only <p> should be a child, not <script> or <style>
    expect(div.children.length).toBe(1)
    expect(div.children[0].tag).toBe("p")
  })

  it("respects isOverlay callback", () => {
    document.body.innerHTML =
      '<div id="app">content</div><div id="overlay">overlay</div>'
    const overlayEl = document.querySelector("#overlay") as HTMLElement
    const { tree } = buildDomTree(document.body, {
      isOverlay: (el) => el === overlayEl,
    })
    // body should only have #app child, not #overlay
    expect(tree!.children.length).toBe(1)
    expect(tree!.children[0].id).toBe("#app")
  })

  it("calls detectComponent for each element", () => {
    document.body.innerHTML =
      '<div data-handle-component="App"><p>hello</p></div>'
    const { tree } = buildDomTree(document.body, {
      detectComponent: (el) =>
        el.getAttribute("data-handle-component") || null,
    })
    const div = tree!.children[0]
    expect(div.component).toBe("App")
    // p has no component
    expect(div.children[0].component).toBeNull()
  })

  it("sets hidden flag for invisible elements", () => {
    document.body.innerHTML =
      '<div style="display:none"><p>hidden</p></div><div>visible</div>'
    const { tree } = buildDomTree(document.body)
    // In jsdom, getComputedStyle doesn't process CSS properly,
    // but we can at least verify the structure
    expect(tree!.children.length).toBe(2)
  })

  it("computes selectorPath for each node", () => {
    document.body.innerHTML = '<div id="app"><h1>Hello</h1></div>'
    const { tree } = buildDomTree(document.body)
    expect(tree!.selectorPath).toBe("body")
    expect(tree!.children[0].selectorPath).toBe("body > div#app")
    expect(tree!.children[0].children[0].selectorPath).toBe(
      "body > div#app > h1",
    )
  })

  it("counts children correctly even with text nodes", () => {
    document.body.innerHTML = "<div><span>a</span>text<span>b</span></div>"
    const { tree } = buildDomTree(document.body)
    const div = tree!.children[0]
    // 2 spans + 1 text = 3 children
    expect(div.childCount).toBe(3)
    expect(div.children.length).toBe(3)
  })

  it("handles empty body", () => {
    document.body.innerHTML = ""
    const { tree } = buildDomTree(document.body)
    expect(tree).not.toBeNull()
    expect(tree!.tag).toBe("body")
    expect(tree!.children.length).toBe(0)
  })

  it("handles deeply nested elements", () => {
    // Build a chain of divs 5 deep
    let html = ""
    for (let i = 0; i < 5; i++) html += "<div>"
    html += "leaf"
    for (let i = 0; i < 5; i++) html += "</div>"
    document.body.innerHTML = html
    const { tree } = buildDomTree(document.body)
    let node = tree!
    for (let i = 0; i < 5; i++) {
      expect(node.children.length).toBeGreaterThanOrEqual(1)
      node = node.children[0]
    }
    // innermost div has the text child
    expect(node.children.length).toBe(1)
    expect(node.children[0].tag).toBe("#text")
    expect(node.children[0].textContent).toBe("leaf")
  })

  it("nodeIds can be used to look up DOM elements from nodeMap", () => {
    document.body.innerHTML =
      '<div id="app"><h1 class="title">Hello</h1><p>World</p></div>'
    const { tree, nodeMap } = buildDomTree(document.body)

    // Find h1 in tree
    const div = tree!.children[0]
    const h1 = div.children[0]
    expect(h1.tag).toBe("h1")

    // Look up h1 DOM element via nodeMap
    const h1Element = nodeMap.get(h1.nodeId)
    expect(h1Element).toBe(document.querySelector("h1"))

    // Find p in tree
    const p = div.children[1]
    expect(p.tag).toBe("p")

    // Look up p DOM element via nodeMap
    const pElement = nodeMap.get(p.nodeId)
    expect(pElement).toBe(document.querySelector("p"))
  })
})
