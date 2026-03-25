import {
  buildDomTree,
  buildSelectorPath,
  detectComponent,
  hasFrameworkMarkers,
  visibleElementAtPoint,
} from "@handle-ai/handle-shared"
import type { TreeNode } from "@handle-ai/handle-shared"

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    let active = false
    let hoveredEl: HTMLElement | null = null
    let overlay: HTMLDivElement | null = null
    let pendingTarget: HTMLElement | null = null
    let nodeMap = new Map<string, Node>()
    let frameworkRetryTimer: ReturnType<typeof setTimeout> | null = null
    // Cache every element we've seen, keyed by selectorPath, so we can
    // re-select elements from the Changes tab even after the tree changes.
    const elementCache = new Map<string, HTMLElement>()

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

    function isOverlayEl(el: HTMLElement): boolean {
      return el === overlay || (overlay != null && overlay.contains(el))
    }

    function rebuildTree(): TreeNode | null {
      const result = buildDomTree(document.body, {
        isOverlay: isOverlayEl,
        detectComponent: (el) =>
          el.getAttribute("data-handle-component") || detectComponent(el),
      })
      nodeMap = result.nodeMap
      // Populate elementCache from nodeMap for selector-based re-selection
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

    function treeHasComponents(node: TreeNode | null): boolean {
      if (!node) return false
      if (node.component) return true
      for (const child of node.children) {
        if (treeHasComponents(child)) return true
      }
      return false
    }

    function sendTree(
      selectedNodeId?: string | null,
      selectedPath?: string[] | null,
    ) {
      if (frameworkRetryTimer) {
        clearTimeout(frameworkRetryTimer)
        frameworkRetryTimer = null
      }
      let tree: ReturnType<typeof rebuildTree>
      try {
        tree = rebuildTree()
      } catch (e) {
        console.error("[handle] rebuildTree error:", e)
        tree = null
      }

      chrome.runtime
        .sendMessage({
          type: "element-tree",
          tree,
          selectedNodeId: selectedNodeId || null,
          selectedPath: selectedPath || null,
        })
        .catch(() => {})

      // If the tree has no components, the framework may not have hydrated yet.
      // Poll briefly and resend the tree once framework markers appear.
      if (tree && !treeHasComponents(tree)) {
        let attempts = 0
        const maxAttempts = 10
        function retryIfFrameworkAppeared() {
          attempts++
          if (hasFrameworkMarkers()) {
            // Request full-tree component annotation, then rebuild
            chrome.runtime
              .sendMessage({ type: "annotate-component-tree" })
              .catch(() => {})
            // Tree will be rebuilt when component-tree-annotated comes back
          } else if (attempts < maxAttempts) {
            frameworkRetryTimer = setTimeout(retryIfFrameworkAppeared, 200)
          }
        }
        frameworkRetryTimer = setTimeout(retryIfFrameworkAppeared, 200)
      }
    }

    function getStyles(nodeId: string) {
      const node = nodeMap.get(nodeId)
      if (!node) return null
      // Text node: return minimal styles with just textContent
      if (node.nodeType === Node.TEXT_NODE) {
        const parentEl = node.parentElement
        const parentCs = parentEl ? getComputedStyle(parentEl) : null
        const textSelectorPath = parentEl
          ? buildSelectorPath(parentEl) +
            "/#text(" +
            Array.from(parentEl.childNodes).indexOf(node as ChildNode) +
            ")"
          : ""
        return {
          styles: {
            fontFamily: parentCs ? parentCs.fontFamily : "",
            fontWeight: parentCs ? parentCs.fontWeight : "",
            fontSize: parentCs ? parentCs.fontSize : "",
            color: parentCs ? parentCs.color : "",
            padding: "0px",
            display: "inline",
            borderRadius: "0px",
            opacity: "1",
            backgroundColor: "rgba(0, 0, 0, 0)",
            borderColor: "rgba(0, 0, 0, 0)",
            borderWidth: "0px",
            borderStyle: "none",
            textContent: node.textContent || "",
          },
          selectorPath: textSelectorPath,
        }
      }
      const el = node as HTMLElement
      const cs = getComputedStyle(el)
      const styles: Record<string, string> = {
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fontSize: cs.fontSize,
        color: cs.color,
        padding: cs.padding,
        display: cs.display,
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
      const selectorPath = buildSelectorPath(el)
      return { styles, selectorPath }
    }

    function onMouseOver(e: MouseEvent) {
      if (hoveredEl) hoveredEl.style.outline = ""
      hoveredEl = visibleElementAtPoint(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        overlay,
      )
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
      const target = visibleElementAtPoint(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        overlay,
      )
      target.setAttribute("data-handle-target", "")
      chrome.runtime.sendMessage({ type: "annotate-components" })
      pendingTarget = target
    }

    function handlePendingTarget() {
      if (!pendingTarget) return
      const el = pendingTarget
      pendingTarget = null
      const tree = rebuildTree()
      const selectedNodeId = findNodeIdForElement(el)
      const selectedPath = selectedNodeId ? getAncestorPath(el) : null
      chrome.runtime
        .sendMessage({
          type: "element-tree",
          tree,
          selectedNodeId,
          selectedPath,
        })
        .catch(() => {})
    }

    function clearElementState() {
      if (hoveredEl) hoveredEl.style.outline = ""
      hideOverlay()
      pendingTarget = null
      nodeMap.clear()
      elementCache.clear()
    }

    // Detect SPA navigations (pushState/replaceState/popstate) and notify
    // the sidepanel so it can clear stale element tree state.
    let lastUrl = location.href
    function checkUrlChange() {
      if (location.href !== lastUrl) {
        lastUrl = location.href
        clearElementState()
        chrome.runtime
          .sendMessage({ type: "spa-navigation" })
          .catch(() => {})
        // Rebuild tree immediately, then request annotation for components
        sendTree()
        chrome.runtime
          .sendMessage({ type: "annotate-component-tree" })
          .catch(() => {})
      }
    }

    const origPushState = history.pushState.bind(history)
    history.pushState = function (...args) {
      origPushState(...args)
      checkUrlChange()
    }
    const origReplaceState = history.replaceState.bind(history)
    history.replaceState = function (...args) {
      origReplaceState(...args)
      checkUrlChange()
    }
    window.addEventListener("popstate", () => checkUrlChange())

    function enable() {
      if (active) return
      active = true
      document.addEventListener("mouseover", onMouseOver, true)
      document.addEventListener("mouseout", onMouseOut, true)
      document.addEventListener("click", onClick, true)
      // Build and send tree immediately (without component annotations).
      // Then request component annotation — when it completes, sendTree() will
      // be called again with component data via the component-tree-annotated handler.
      sendTree()
      chrome.runtime
        .sendMessage({ type: "annotate-component-tree" })
        .catch(() => {})
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
      nodeMap.clear()
      elementCache.clear()
    }

    chrome.runtime.onMessage.addListener(
      (message, _sender, sendResponse) => {
        if (message.type === "enable-design-mode") {
          enable()
        } else if (message.type === "disable-design-mode") {
          disable()
        } else if (message.type === "highlight-element") {
          const node = nodeMap.get(message.nodeId)
          if (node) {
            if (node.nodeType === Node.TEXT_NODE) {
              if (node.parentElement) showOverlay(node.parentElement)
            } else {
              showOverlay(node as HTMLElement)
            }
          }
        } else if (message.type === "clear-highlight") {
          hideOverlay()
        } else if (message.type === "get-styles") {
          sendResponse(getStyles(message.nodeId))
          return true
        } else if (message.type === "set-style") {
          const node = nodeMap.get(message.nodeId)
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            ;(node as HTMLElement).style[message.prop as any] = message.value
          }
        } else if (message.type === "set-icon") {
          const node = nodeMap.get(message.nodeId)
          if (node && node.nodeType === Node.ELEMENT_NODE && message.svgChildren != null) {
            const el = node as HTMLElement
            el.innerHTML = message.svgChildren
            const classes = [...el.classList]
            const oldLucideClass = classes.find((c) =>
              c.startsWith("lucide-"),
            )
            if (oldLucideClass)
              el.classList.replace(oldLucideClass, `lucide-${message.name}`)
          }
        } else if (message.type === "set-text") {
          const node = nodeMap.get(message.nodeId)
          if (node) {
            if (node.nodeType === Node.TEXT_NODE) {
              node.nodeValue = message.value
            } else {
              node.textContent = message.value
            }
          }
        } else if (message.type === "select-by-selector") {
          const el = elementCache.get(message.selectorPath)
          if (el && document.contains(el)) {
            el.setAttribute("data-handle-target", "")
            chrome.runtime.sendMessage({ type: "annotate-components" })
            pendingTarget = el
          }
        } else if (message.type === "components-annotated") {
          // Single-element annotation done (after click or select-by-selector)
          handlePendingTarget()
        } else if (message.type === "component-tree-annotated") {
          // Full-tree annotation done — build and send tree
          sendTree()
        } else if (message.type === "build-tree") {
          sendTree()
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

          function scanRules(rules: CSSRuleList) {
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule) {
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i]
                  if (prop.startsWith("--") && !seen.has(prop)) {
                    seen.add(prop)
                    names.push(prop)
                  }
                }

                const m = utilityRe.exec(rule.selectorText)
                if (m) {
                  const prefix = m[1]
                  const colorProp =
                    prefix === "bg" ? "background-color" : "color"
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
                    const colorName = "color-" + m[2]
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

          const probe = document.createElement("span")
          probe.style.display = "none"
          document.body.appendChild(probe)
          function resolveColor(css: string): string | null {
            probe.style.color = ""
            probe.style.color = css
            if (!probe.style.color) return null
            return getComputedStyle(probe).color
          }

          const rootCs = getComputedStyle(document.documentElement)
          const isColor =
            /^#|^rgba?\(|^hsla?\(|^oklch\(|^oklab\(|^lch\(|^lab\(|^color\(/
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

          for (const [name, raw] of utilityClasses) {
            const withVars = raw.replace(/var\((--[\w-]+)\)/g, (_, v) =>
              rootCs.getPropertyValue(v).trim() || "1",
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
      },
    )
  },
})
