import type { TreeNode } from "../types"

const FILTERED_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "link",
  "meta",
])
const MAX_DEPTH = 25
const MAX_NODES = 3000
const MAX_CHILDREN = 50

/** Build a unique-ish CSS selector segment for a single element */
export function buildSelectorSegment(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const id = el.id ? `#${el.id}` : ""
  const classes = el.classList.length
    ? `.${[...el.classList].join(".")}`
    : ""
  const base = `${tag}${id}${classes}`
  if (el.id) return base
  const parent = el.parentElement
  if (!parent) return base
  const siblings = Array.from(parent.children) as HTMLElement[]
  const matching = siblings.filter((sib) => {
    const sTag = sib.tagName.toLowerCase()
    const sId = sib.id ? `#${sib.id}` : ""
    const sClasses = sib.classList.length
      ? `.${[...sib.classList].join(".")}`
      : ""
    return `${sTag}${sId}${sClasses}` === base
  })
  if (matching.length <= 1) return base
  const childIndex = siblings.indexOf(el) + 1
  return `${base}:nth-child(${childIndex})`
}

/** Build a full CSS selector path from root to element */
export function buildSelectorPath(el: HTMLElement): string {
  const segments: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.documentElement) {
    segments.unshift(buildSelectorSegment(current))
    current = current.parentElement
  }
  return segments.join(" > ")
}

export interface BuildDomTreeOptions {
  isOverlay?: (el: HTMLElement) => boolean
  detectComponent?: (el: HTMLElement) => string | null
}

/**
 * Recursively build a TreeNode tree from a root element.
 * Returns the tree and a nodeMap mapping nodeId → DOM node.
 */
export function buildDomTree(
  root: HTMLElement,
  opts: BuildDomTreeOptions = {},
): { tree: TreeNode | null; nodeMap: Map<string, Node> } {
  const nodeMap = new Map<string, Node>()
  let nodeCounter = 0
  const isOverlay = opts.isOverlay ?? (() => false)
  const detectComponent = opts.detectComponent ?? (() => null)

  function walk(el: HTMLElement, depth: number): TreeNode | null {
    if (nodeCounter >= MAX_NODES) return null
    if (depth > MAX_DEPTH) return null
    const tag = el.tagName.toLowerCase()
    if (FILTERED_TAGS.has(tag)) return null
    if (isOverlay(el)) return null

    const nodeId = String(nodeCounter++)
    nodeMap.set(nodeId, el)

    const selectorPath = buildSelectorPath(el)
    const id = el.id ? `#${el.id}` : ""
    const classes = el.classList.length
      ? `.${[...el.classList].join(".")}`
      : ""
    const component = detectComponent(el)

    const children: TreeNode[] = []
    let realChildCount = 0
    let childrenAdded = 0
    const childNodes = Array.from(el.childNodes)
    for (const child of childNodes) {
      if (childrenAdded >= MAX_CHILDREN) break
      if (nodeCounter >= MAX_NODES) break
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement
        if (
          FILTERED_TAGS.has(childEl.tagName.toLowerCase()) ||
          isOverlay(childEl)
        )
          continue
        realChildCount++
        const childNode = walk(childEl, depth + 1)
        if (childNode) {
          children.push(childNode)
          childrenAdded++
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || "").trim()
        if (text.length > 0) {
          realChildCount++
          const textNodeId = String(nodeCounter++)
          nodeMap.set(textNodeId, child)
          children.push({
            nodeId: textNodeId,
            tag: "#text",
            id: "",
            classes: "",
            component: null,
            childCount: 0,
            children: [],
            textContent: text,
          })
          childrenAdded++
        }
      }
    }

    const node: TreeNode = {
      nodeId,
      tag,
      id,
      classes,
      component,
      childCount: realChildCount,
      children,
      selectorPath,
    }
    if (!isElementVisible(el)) {
      node.hidden = true
    }
    return node
  }

  const tree = walk(root, 0)
  return { tree, nodeMap }
}

/** Check if an element is visually perceivable */
export function isElementVisible(el: HTMLElement): boolean {
  const cs = getComputedStyle(el)
  if (cs.opacity === "0") return false
  if (cs.visibility === "hidden") return false
  if (cs.display === "none") return false
  if (el.getAttribute("aria-hidden") === "true") return false
  return true
}

/** Find the first visible element at a screen point, skipping overlayEl */
export function visibleElementAtPoint(
  x: number,
  y: number,
  fallback: HTMLElement,
  overlayEl?: HTMLElement | null,
): HTMLElement {
  const elements = document.elementsFromPoint(x, y) as HTMLElement[]
  for (const el of elements) {
    if (overlayEl && (el === overlayEl || overlayEl.contains(el))) continue
    if (isElementVisible(el)) return el
  }
  return fallback
}

/**
 * Plain JS string snippets for injection into string-based content scripts.
 * These mirror the typed functions above for use in handle-app's webview
 * where TypeScript imports are not available at runtime.
 */

export const buildSelectorSegmentSnippet = `
  function buildSelectorSegment(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? "#" + el.id : "";
    var classes = el.classList.length
      ? "." + [...el.classList].join(".")
      : "";
    var base = tag + id + classes;
    if (el.id) return base;
    var parent = el.parentElement;
    if (!parent) return base;
    var siblings = Array.from(parent.children);
    var matching = siblings.filter(function(sib) {
      var sTag = sib.tagName.toLowerCase();
      var sId = sib.id ? "#" + sib.id : "";
      var sClasses = sib.classList.length
        ? "." + [...sib.classList].join(".")
        : "";
      return (sTag + sId + sClasses) === base;
    });
    if (matching.length <= 1) return base;
    var childIndex = siblings.indexOf(el) + 1;
    return base + ":nth-child(" + childIndex + ")";
  }
`

export const buildSelectorPathSnippet = `
  function buildSelectorPath(el) {
    var segments = [];
    var current = el;
    while (current && current !== document.documentElement) {
      segments.unshift(buildSelectorSegment(current));
      current = current.parentElement;
    }
    return segments.join(" > ");
  }
`

export const buildDomTreeSnippet = `
  var FILTERED_TAGS = new Set(["script", "style", "noscript", "link", "meta"]);
  var MAX_DEPTH = 25;
  var MAX_NODES = 3000;
  var MAX_CHILDREN = 50;

  var _nodeCounter = 0;

  function _buildDomTree(el, depth, nodeMap, isOverlayFn, detectComponentFn) {
    if (_nodeCounter >= MAX_NODES) return null;
    if (depth > MAX_DEPTH) return null;
    var tag = el.tagName.toLowerCase();
    if (FILTERED_TAGS.has(tag)) return null;
    if (isOverlayFn && isOverlayFn(el)) return null;

    var nodeId = String(_nodeCounter++);
    nodeMap.set(nodeId, el);

    var selectorPath = buildSelectorPath(el);

    var id = el.id ? "#" + el.id : "";
    var classes = el.classList.length
      ? "." + [...el.classList].join(".")
      : "";
    var component = detectComponentFn ? detectComponentFn(el) : null;

    var children = [];
    var realChildCount = 0;
    var childrenAdded = 0;
    var childNodes = Array.from(el.childNodes);
    for (var ci = 0; ci < childNodes.length; ci++) {
      if (childrenAdded >= MAX_CHILDREN) break;
      if (_nodeCounter >= MAX_NODES) break;
      var child = childNodes[ci];
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (FILTERED_TAGS.has(child.tagName.toLowerCase())) continue;
        if (isOverlayFn && isOverlayFn(child)) continue;
        realChildCount++;
        var childNode = _buildDomTree(child, depth + 1, nodeMap, isOverlayFn, detectComponentFn);
        if (childNode) {
          children.push(childNode);
          childrenAdded++;
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        var text = (child.textContent || "").trim();
        if (text.length > 0) {
          realChildCount++;
          var textNodeId = String(_nodeCounter++);
          nodeMap.set(textNodeId, child);
          children.push({
            nodeId: textNodeId,
            tag: "#text",
            id: "",
            classes: "",
            component: null,
            childCount: 0,
            children: [],
            textContent: text
          });
          childrenAdded++;
        }
      }
    }

    var node = {
      nodeId: nodeId,
      tag: tag,
      id: id,
      classes: classes,
      component: component,
      childCount: realChildCount,
      children: children,
      selectorPath: selectorPath
    };
    if (!isElementVisible(el)) {
      node.hidden = true;
    }
    return node;
  }

  function buildDomTree(root, isOverlayFn, detectComponentFn) {
    var nodeMap = new Map();
    _nodeCounter = 0;
    var tree = _buildDomTree(root, 0, nodeMap, isOverlayFn, detectComponentFn);
    return { tree: tree, nodeMap: nodeMap };
  }
`

export const visibleElementAtPointSnippet = `
  function isElementVisible(el) {
    var cs = getComputedStyle(el);
    if (cs.opacity === "0") return false;
    if (cs.visibility === "hidden") return false;
    if (cs.display === "none") return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    return true;
  }

  function visibleElementAtPoint(x, y, fallback, overlayEl) {
    var elements = document.elementsFromPoint(x, y);
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (overlayEl && (el === overlayEl || overlayEl.contains(el))) continue;
      if (isElementVisible(el)) return el;
    }
    return fallback;
  }
`
