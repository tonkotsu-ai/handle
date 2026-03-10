import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

let active = false
let hoveredEl: HTMLElement | null = null
let ancestors: HTMLElement[] = []
let overlay: HTMLDivElement | null = null
let pendingTarget: HTMLElement | null = null

function getOverlay() {
  if (!overlay) {
    overlay = document.createElement("div")
    overlay.style.cssText =
      "position:fixed;pointer-events:none;border:2px solid #4A90D9;background:rgba(74,144,217,0.1);z-index:2147483647;transition:all 0.15s ease;display:none;"
    document.documentElement.appendChild(overlay)
  }
  return overlay
}

function showOverlay(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  const o = getOverlay()
  o.style.top = rect.top + "px"
  o.style.left = rect.left + "px"
  o.style.width = rect.width + "px"
  o.style.height = rect.height + "px"
  o.style.display = "block"
}

function hideOverlay() {
  if (overlay) overlay.style.display = "none"
}

function buildHierarchy(el: HTMLElement) {
  ancestors = []
  const hierarchy = []
  let current: HTMLElement | null = el
  while (current && current !== document.documentElement) {
    ancestors.push(current)
    const tag = current.tagName.toLowerCase()
    const id = current.id ? `#${current.id}` : ""
    const classes = current.classList.length
      ? `.${[...current.classList].join(".")}`
      : ""
    const component = current.getAttribute("data-handle-component") || null
    hierarchy.push({ tag, id, classes, component })
    current = current.parentElement
  }
  return hierarchy
}

function getStyles(index: number) {
  const el = ancestors[index]
  if (!el) return null
  const cs = getComputedStyle(el)
  const styles: Record<string, string> = {
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    fontSize: cs.fontSize,
    padding: cs.padding,
    display: cs.display
  }
  if (cs.display === "flex" || cs.display === "inline-flex") {
    styles.flexDirection = cs.flexDirection
    styles.justifyContent = cs.justifyContent
    styles.alignItems = cs.alignItems
    styles.gap = cs.gap
    styles.flexWrap = cs.flexWrap
  } else if (cs.display === "grid" || cs.display === "inline-grid") {
    styles.justifyItems = cs.justifyItems
    styles.alignItems = cs.alignItems
    styles.gap = cs.gap
  }
  styles.borderRadius = cs.borderRadius
  styles.backgroundColor = cs.backgroundColor
  styles.borderColor = cs.borderColor
  styles.borderWidth = cs.borderWidth
  styles.borderStyle = cs.borderStyle
  const isTextOnly =
    el.childNodes.length > 0 &&
    [...el.childNodes].every((n) => n.nodeType === Node.TEXT_NODE)
  if (isTextOnly) {
    styles.textContent = el.textContent || ""
  }
  return styles
}

function onMouseOver(e: MouseEvent) {
  if (hoveredEl) hoveredEl.style.outline = ""
  hoveredEl = e.target as HTMLElement
  hoveredEl.style.outline = "2px solid #4A90D9"
}

function onMouseOut(e: MouseEvent) {
  ;(e.target as HTMLElement).style.outline = ""
}

function onClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (hoveredEl) hoveredEl.style.outline = ""
  hoveredEl = null
  const target = e.target as HTMLElement
  target.setAttribute("data-handle-target", "")
  chrome.runtime.sendMessage({ type: "annotate-react" })
  pendingTarget = target
}

function enable() {
  if (active) return
  active = true
  document.addEventListener("mouseover", onMouseOver, true)
  document.addEventListener("mouseout", onMouseOut, true)
  document.addEventListener("click", onClick, true)
}

function disable() {
  if (!active) return
  active = false
  document.removeEventListener("mouseover", onMouseOver, true)
  document.removeEventListener("mouseout", onMouseOut, true)
  document.removeEventListener("click", onClick, true)
  if (hoveredEl) hoveredEl.style.outline = ""
  hideOverlay()
  if (overlay) overlay.remove()
  overlay = null
  document.querySelectorAll("[data-handle-component]").forEach((n) => {
    n.removeAttribute("data-handle-component")
  })
  pendingTarget = null
  ancestors = []
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "enable-design-mode") {
    enable()
  } else if (message.type === "disable-design-mode") {
    disable()
  } else if (message.type === "highlight-element") {
    const el = ancestors[message.index]
    if (el) showOverlay(el)
  } else if (message.type === "clear-highlight") {
    hideOverlay()
  } else if (message.type === "get-styles") {
    sendResponse(getStyles(message.index))
    return true
  } else if (message.type === "set-style") {
    const el = ancestors[message.index]
    if (el) el.style[message.prop as any] = message.value
  } else if (message.type === "set-icon") {
    const el = ancestors[message.index]
    if (el && message.svgChildren != null) {
      // Update SVG innerHTML with new icon paths
      el.innerHTML = message.svgChildren
      // Swap lucide-{old} class to lucide-{new}
      const classes = [...el.classList]
      const oldLucideClass = classes.find((c) => c.startsWith("lucide-"))
      if (oldLucideClass) el.classList.replace(oldLucideClass, `lucide-${message.name}`)
    }
  } else if (message.type === "set-text") {
    const el = ancestors[message.index]
    if (el) el.textContent = message.value
  } else if (message.type === "react-annotated") {
    if (pendingTarget) {
      const el = pendingTarget
      pendingTarget = null
      const hierarchy = buildHierarchy(el)
      chrome.runtime.sendMessage({ type: "element-hierarchy", hierarchy })
    }
  }
})
