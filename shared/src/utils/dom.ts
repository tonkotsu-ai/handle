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
 * Detect the framework component that owns a DOM element.
 * Supports React, Vue 3, Vue 2, Angular (dev mode), and Svelte (dev mode).
 * Returns the component name or null.
 */
export function detectComponent(el: HTMLElement): string | null {
  const elAny = el as any

  // React
  const reactKey = Object.keys(el).find(
    (k) =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$"),
  )
  if (reactKey) {
    let fiber = elAny[reactKey]?.return
    while (fiber) {
      if (typeof fiber.type === "string") break
      if (
        fiber.type != null &&
        (typeof fiber.type === "function" ||
        typeof fiber.type === "object")
      ) {
        const name = fiber.type.displayName || fiber.type.name || null
        if (name) return name
      }
      fiber = fiber.return
    }
  }

  // Vue 3 — only label the component's root DOM element
  if (elAny.__vueParentComponent && elAny.__vueParentComponent.subTree?.el === el) {
    const name =
      elAny.__vueParentComponent.type?.name ||
      elAny.__vueParentComponent.type?.__name
    if (name) return name
  }

  // Vue 2 — only label the component's root DOM element
  if (elAny.__vue__ && elAny.__vue__.$el === el) {
    const name =
      elAny.__vue__.$options?.name || elAny.__vue__.$options?._componentTag
    if (name) return name
  }

  // Angular (dev mode exposes ng global)
  if (typeof (globalThis as any).ng !== "undefined") {
    try {
      const comp = (globalThis as any).ng.getComponent(el)
      if (comp) {
        const raw = comp.constructor?.name
        if (raw && raw !== "Object") {
          return raw.replace(/^_+/, "")
        }
      }
    } catch {
      // ng.getComponent may throw for non-component elements
    }
  }

  // Svelte (dev mode attaches __svelte_meta to all elements in a component)
  // Only label the outermost element — skip if the parent belongs to the same file
  if (elAny.__svelte_meta) {
    const file = elAny.__svelte_meta.loc?.file
    if (file) {
      const parentFile = (el.parentElement as any)?.__svelte_meta?.loc?.file
      if (parentFile !== file) {
        const match = file.match(/([^/]+)\.svelte$/)
        if (match) return match[1]
      }
    }
  }

  return null
}

/**
 * Check whether any JS framework has attached metadata to DOM elements.
 * Scans the first 200 body elements for React, Vue, Angular, or Svelte markers.
 */
export function hasFrameworkMarkers(): boolean {
  const els = document.querySelectorAll("body *")
  const limit = Math.min(els.length, 200)
  for (let i = 0; i < limit; i++) {
    const el = els[i] as any
    // Vue
    if (el.__vueParentComponent || el.__vue__) return true
    // Svelte
    if (el.__svelte_meta) return true
    // React / Angular
    const keys = Object.keys(els[i])
    for (const k of keys) {
      if (
        k.startsWith("__reactFiber$") ||
        k.startsWith("__reactInternalInstance$")
      )
        return true
      if (k.startsWith("__ngContext__")) return true
    }
  }
  // Angular global
  if (typeof (globalThis as any).ng !== "undefined") return true
  return false
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

export const detectComponentSnippet = `
  function detectComponent(el) {
    // React
    var reactKey = Object.keys(el).find(function(k) {
      return k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$");
    });
    if (reactKey) {
      var fiber = el[reactKey] && el[reactKey].return;
      while (fiber) {
        if (typeof fiber.type === "string") break;
        if (fiber.type != null && (typeof fiber.type === "function" || typeof fiber.type === "object")) {
          var name = fiber.type.displayName || fiber.type.name || null;
          if (name) return name;
        }
        fiber = fiber.return;
      }
    }
    // Vue 3 — only label the component's root DOM element
    if (el.__vueParentComponent && el.__vueParentComponent.subTree && el.__vueParentComponent.subTree.el === el) {
      var vName = (el.__vueParentComponent.type && el.__vueParentComponent.type.name) ||
        (el.__vueParentComponent.type && el.__vueParentComponent.type.__name);
      if (vName) return vName;
    }
    // Vue 2 — only label the component's root DOM element
    if (el.__vue__ && el.__vue__.$el === el) {
      var v2Name = (el.__vue__.$options && el.__vue__.$options.name) ||
        (el.__vue__.$options && el.__vue__.$options._componentTag);
      if (v2Name) return v2Name;
    }
    // Angular (dev mode)
    if (typeof ng !== "undefined" && ng.getComponent) {
      try {
        var comp = ng.getComponent(el);
        if (comp) {
          var aName = comp.constructor && comp.constructor.name;
          if (aName && aName !== "Object") return aName.replace(/^_+/, "");
        }
      } catch(e) {}
    }
    // Svelte (dev mode) — only label outermost element per component
    if (el.__svelte_meta) {
      var file = el.__svelte_meta.loc && el.__svelte_meta.loc.file;
      if (file) {
        var parentMeta = el.parentElement && el.parentElement.__svelte_meta;
        var parentFile = parentMeta && parentMeta.loc && parentMeta.loc.file;
        if (parentFile !== file) {
          var match = file.match(/([^/]+)\\.svelte$/);
          if (match) return match[1];
        }
      }
    }
    return null;
  }
`

export const hasFrameworkMarkersSnippet = `
  function hasFrameworkMarkers() {
    var els = document.querySelectorAll("body *");
    var limit = Math.min(els.length, 200);
    for (var i = 0; i < limit; i++) {
      var el = els[i];
      if (el.__vueParentComponent || el.__vue__) return true;
      if (el.__svelte_meta) return true;
      var keys = Object.keys(el);
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf("__reactFiber$") === 0 || keys[j].indexOf("__reactInternalInstance$") === 0) return true;
        if (keys[j].indexOf("__ngContext__") === 0) return true;
      }
    }
    if (typeof ng !== "undefined") return true;
    return false;
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
