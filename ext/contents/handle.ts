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

function buildSelectorSegment(el: HTMLElement): string {
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

function buildHierarchy(el: HTMLElement) {
  ancestors = []
  const hierarchy = []
  const segments: string[] = []
  let current: HTMLElement | null = el
  while (current && current !== document.documentElement) {
    ancestors.push(current)
    const tag = current.tagName.toLowerCase()
    const id = current.id ? `#${current.id}` : ""
    const classes = current.classList.length
      ? `.${[...current.classList].join(".")}`
      : ""
    const component = current.getAttribute("data-handle-component") || null
    segments.push(buildSelectorSegment(current))
    const selectorPath = [...segments].reverse().join(" > ")
    hierarchy.push({ tag, id, classes, component, selectorPath })
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
    color: cs.color,
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
  styles.opacity = cs.opacity
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
  } else if (message.type === "get-page-colors") {
    const colors = new Set<string>()
    const elements = document.querySelectorAll("*")
    const arr = Array.from(elements)
    const step = arr.length > 2000 ? Math.ceil(arr.length / 2000) : 1
    for (let i = 0; i < arr.length; i += step) {
      const cs = getComputedStyle(arr[i] as HTMLElement)
      const bg = cs.backgroundColor
      const border = cs.borderColor
      const color = cs.color
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent")
        colors.add(bg)
      if (
        border &&
        border !== "rgba(0, 0, 0, 0)" &&
        border !== "transparent" &&
        border !== bg
      )
        colors.add(border)
      if (color && color !== "rgba(0, 0, 0, 0)") colors.add(color)
    }
    sendResponse(Array.from(colors).slice(0, 30))
    return true
  } else if (message.type === "get-page-tokens") {
    const seen = new Set<string>()
    const names: string[] = []
    const utilityClasses = new Map<string, string>()
    const utilityRe = /^\.(bg|text)-([\w-]+)$/

    // Collect custom property names and utility classes from all stylesheets
    function scanRules(rules: CSSRuleList) {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          // Collect CSS custom properties
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i]
            if (prop.startsWith("--") && !seen.has(prop)) {
              seen.add(prop)
              names.push(prop)
            }
          }

          // Collect Tailwind utility classes (bg-*, text-*)
          const m = utilityRe.exec(rule.selectorText)
          if (m) {
            const prefix = m[1]
            const colorProp =
              prefix === "bg" ? "background-color" : "color"
            // Only include if every property is the color prop or a --tw-* var
            let valid = false
            for (let i = 0; i < rule.style.length; i++) {
              const p = rule.style[i]
              if (p === colorProp) valid = true
              else if (!p.startsWith("--tw-")) {
                valid = false
                break
              }
            }
            if (valid) {
              const colorName = "color-" + m[2] // bg-xyz / text-xyz → color-xyz
              const value = rule.style.getPropertyValue(colorProp).trim()
              if (value && !utilityClasses.has(colorName)) {
                utilityClasses.set(colorName, value)
              }
            }
          }
        } else if (
          rule instanceof CSSMediaRule ||
          rule instanceof CSSSupportsRule ||
          rule instanceof CSSLayerBlockRule
        ) {
          scanRules(rule.cssRules)
        }
      }
    }

    try {
      for (const sheet of document.styleSheets) {
        try {
          scanRules(sheet.cssRules)
        } catch {
          // Cross-origin stylesheet — skip
        }
      }
    } catch {
      // styleSheets access failed
    }

    // Resolve a CSS color string to the browser's canonical rgb() form
    const probe = document.createElement("span")
    probe.style.display = "none"
    document.body.appendChild(probe)
    function resolveColor(css: string): string | null {
      probe.style.color = ""
      probe.style.color = css
      if (!probe.style.color) return null
      return getComputedStyle(probe).color
    }

    // Resolve CSS variable tokens
    const rootCs = getComputedStyle(document.documentElement)
    const isColor = /^#|^rgba?\(|^hsla?\(|^oklch\(|^oklab\(|^lch\(|^lab\(|^color\(/
    const tokens: Array<{ name: string; value: string }> = []
    const tokenValues = new Set<string>()
    for (const name of names) {
      const raw = rootCs.getPropertyValue(name).trim()
      if (!raw || !isColor.test(raw)) continue
      const resolved = resolveColor(raw)
      if (resolved) {
        tokens.push({ name, value: resolved })
        tokenValues.add(resolved.toLowerCase())
      }
    }

    // Merge utility class tokens, skipping duplicates of CSS variable values
    for (const [name, raw] of utilityClasses) {
      // Resolve var() references (e.g. rgba(10,20,30, var(--tw-bg-opacity)))
      const withVars = raw.replace(/var\((--[\w-]+)\)/g, (_, v) =>
        rootCs.getPropertyValue(v).trim() || "1"
      )
      if (!isColor.test(withVars)) continue
      const resolved = resolveColor(withVars)
      if (resolved && !tokenValues.has(resolved.toLowerCase())) {
        tokens.push({ name: `--${name}`, value: resolved })
        tokenValues.add(resolved.toLowerCase())
      }
    }

    probe.remove()

    sendResponse(tokens.slice(0, 100))
    return true
  }
})
