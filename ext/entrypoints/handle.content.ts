import {
  buildDomTree,
  buildSelectorPath,
  createMeasurementOverlays,
  clearMeasurementOverlays,
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
    let highlightedEl: HTMLElement | null = null
    let measureContainer: HTMLDivElement | null = null
    let measuredEl: HTMLElement | null = null
    let selectedMeasuredEl: HTMLElement | null = null
    let inlineEdit: {
      el: HTMLElement
      nodeId: string | null
      selectorPath: string
      originalText: string
      hadContentEditable: boolean
      previousContentEditable: string | null
      previousSpellcheck: string | null
      previousOutline: string
      previousOutlineOffset: string
      previousCursor: string
      onKeyDown: (event: KeyboardEvent) => void
      onBlur: () => void
      onPaste: (event: ClipboardEvent) => void
      finishing: boolean
    } | null = null
    let pendingSingleClickTimer: ReturnType<typeof setTimeout> | null = null
    let pendingSingleClickTarget: HTMLElement | null = null
    // Cache every element we've seen, keyed by selectorPath, so we can
    // re-select elements from the Changes tab even after the tree changes.
    const elementCache = new Map<string, HTMLElement>()
    const DBLCLICK_WINDOW_MS = 250

    function getSpecifiedStyle(el: HTMLElement, prop: string): string {
      if ((el.style as any)[prop]) return (el.style as any)[prop]
      let value = ""
      try {
        for (let i = 0; i < document.styleSheets.length; i++) {
          let rules: CSSRuleList
          try {
            rules = document.styleSheets[i].cssRules
          } catch {
            continue
          }
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j] as CSSStyleRule
            if (rule.style && rule.style.getPropertyValue(prop) && el.matches(rule.selectorText)) {
              value = rule.style.getPropertyValue(prop)
            }
          }
        }
      } catch {}
      return value
    }

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
      highlightedEl = el
      const rect = el.getBoundingClientRect()
      const o = getOverlay()
      o.style.top = rect.top + "px"
      o.style.left = rect.left + "px"
      o.style.width = rect.width + "px"
      o.style.height = rect.height + "px"
      o.style.display = "block"
    }

    function hideOverlay() {
      highlightedEl = null
      if (overlay) overlay.style.display = "none"
    }

    window.addEventListener("resize", () => {
      if (highlightedEl) showOverlay(highlightedEl)
      if (measuredEl) showMeasurementsForEl(measuredEl)
      else if (selectedMeasuredEl) showMeasurementsForEl(selectedMeasuredEl)
    })

    window.addEventListener("scroll", () => {
      if (highlightedEl) showOverlay(highlightedEl)
      if (measuredEl) showMeasurementsForEl(measuredEl)
      else if (selectedMeasuredEl) showMeasurementsForEl(selectedMeasuredEl)
    }, true)

    function getMeasureContainer() {
      if (!measureContainer) {
        measureContainer = document.createElement("div")
        measureContainer.style.cssText =
          "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483646;"
        document.documentElement.appendChild(measureContainer)
      }
      return measureContainer
    }

    function showMeasurementsForEl(el: HTMLElement) {
      measuredEl = el
      createMeasurementOverlays(el, getMeasureContainer())
    }

    function hideMeasurements() {
      measuredEl = null
      if (measureContainer) clearMeasurementOverlays(measureContainer)
    }

    function isOverlayEl(el: HTMLElement): boolean {
      return el === overlay || (overlay != null && overlay.contains(el))
        || el === measureContainer || (measureContainer != null && measureContainer.contains(el))
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
        margin: cs.margin,
        display: cs.display,
        width: getSpecifiedStyle(el, "width"),
        height: getSpecifiedStyle(el, "height"),
        widthComputed: cs.width,
        heightComputed: cs.height,
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
        styles.gridTemplateColumns = cs.gridTemplateColumns
        styles.gridTemplateRows = cs.gridTemplateRows
        styles.gridAutoFlow = cs.gridAutoFlow
        styles.columnGap = cs.columnGap
        styles.rowGap = cs.rowGap
      }
      styles.borderRadius = cs.borderRadius
      styles.opacity = cs.opacity
      styles.backgroundColor = cs.backgroundColor
      styles.borderColor = cs.borderColor
      styles.borderWidth = cs.borderWidth
      styles.borderStyle = cs.borderStyle
      styles.paddingTop = cs.paddingTop
      styles.paddingRight = cs.paddingRight
      styles.paddingBottom = cs.paddingBottom
      styles.paddingLeft = cs.paddingLeft
      styles.marginTop = cs.marginTop
      styles.marginRight = cs.marginRight
      styles.marginBottom = cs.marginBottom
      styles.marginLeft = cs.marginLeft
      styles.borderTopWidth = cs.borderTopWidth
      styles.borderRightWidth = cs.borderRightWidth
      styles.borderBottomWidth = cs.borderBottomWidth
      styles.borderLeftWidth = cs.borderLeftWidth
      styles.overflow = cs.overflow
      styles.minWidth = cs.minWidth
      styles.maxWidth = cs.maxWidth
      styles.minHeight = cs.minHeight
      styles.maxHeight = cs.maxHeight
      styles.borderTopLeftRadius = cs.borderTopLeftRadius
      styles.borderTopRightRadius = cs.borderTopRightRadius
      styles.borderBottomLeftRadius = cs.borderBottomLeftRadius
      styles.borderBottomRightRadius = cs.borderBottomRightRadius
      styles.boxShadow = cs.boxShadow
      styles.lineHeight = cs.lineHeight
      styles.letterSpacing = cs.letterSpacing
      styles.textAlign = cs.textAlign
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
      if (inlineEdit) return
      if (hoveredEl) hoveredEl.style.outline = ""
      hoveredEl = visibleElementAtPoint(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        overlay,
      )
      if (isOverlayEl(hoveredEl)) return
      hoveredEl.style.outline = "2px solid #4A90D9"
      showMeasurementsForEl(hoveredEl)
    }

    function onMouseOut(e: MouseEvent) {
      if (inlineEdit) return
      ;(e.target as HTMLElement).style.outline = ""
      // Restore selection measurements if we have a selected element, otherwise hide
      if (selectedMeasuredEl) {
        showMeasurementsForEl(selectedMeasuredEl)
      } else {
        hideMeasurements()
      }
    }

    function isTextOnlyLeaf(el: HTMLElement | null): boolean {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false
      if (el.getAttribute("contenteditable") === "true") return false
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.tagName === "SCRIPT" ||
        el.tagName === "STYLE"
      ) {
        return false
      }
      if (el.childNodes.length !== 1) return false
      const child = el.childNodes[0]
      return (
        child.nodeType === Node.TEXT_NODE &&
        Boolean(child.nodeValue && child.nodeValue.trim())
      )
    }

    function doSelectClick(target: HTMLElement) {
      if (hoveredEl) hoveredEl.style.outline = ""
      hoveredEl = null
      target.setAttribute("data-handle-target", "")
      chrome.runtime.sendMessage({ type: "annotate-components" })
      pendingTarget = target
    }

    function clearPendingSingleClick() {
      if (pendingSingleClickTimer) {
        clearTimeout(pendingSingleClickTimer)
        pendingSingleClickTimer = null
      }
      pendingSingleClickTarget = null
    }

    function onClick(e: MouseEvent) {
      if (
        inlineEdit &&
        inlineEdit.el &&
        (inlineEdit.el === e.target || inlineEdit.el.contains(e.target as Node))
      ) {
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      if (inlineEdit) return
      const target = visibleElementAtPoint(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        overlay,
      )
      if (isTextOnlyLeaf(target)) {
        if (pendingSingleClickTimer && pendingSingleClickTarget === target) {
          return
        }
        clearPendingSingleClick()
        pendingSingleClickTarget = target
        pendingSingleClickTimer = setTimeout(() => {
          pendingSingleClickTimer = null
          pendingSingleClickTarget = null
          doSelectClick(target)
        }, DBLCLICK_WINDOW_MS)
        return
      }
      doSelectClick(target)
    }

    function onDblClick(e: MouseEvent) {
      if (!active) return
      e.preventDefault()
      e.stopImmediatePropagation()
      clearPendingSingleClick()
      if (inlineEdit) return
      const target = visibleElementAtPoint(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        overlay,
      )
      if (!isTextOnlyLeaf(target)) {
        doSelectClick(target)
        return
      }
      startInlineEdit(target)
    }

    function startInlineEdit(el: HTMLElement) {
      if (inlineEdit) return
      if (hoveredEl) hoveredEl.style.outline = ""
      hoveredEl = null
      hideOverlay()
      hideMeasurements()
      selectedMeasuredEl = null

      let nodeId = findNodeIdForElement(el)
      if (!nodeId) {
        try {
          rebuildTree()
        } catch {}
        nodeId = findNodeIdForElement(el)
      }

      let selectorPath = ""
      try {
        selectorPath = buildSelectorPath(el)
      } catch {}

      const hadContentEditable = el.hasAttribute("contenteditable")
      const previousContentEditable = hadContentEditable
        ? el.getAttribute("contenteditable")
        : null
      const previousSpellcheck = el.getAttribute("spellcheck")
      const previousOutline = el.style.outline
      const previousOutlineOffset = el.style.outlineOffset
      const previousCursor = el.style.cursor
      const originalText = el.textContent || ""

      el.setAttribute("contenteditable", "true")
      el.setAttribute("spellcheck", "false")
      el.style.outline = "2px solid #4A90D9"
      el.style.outlineOffset = "2px"
      el.style.cursor = "text"

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault()
          event.stopPropagation()
          commitInlineEdit()
        } else if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          cancelInlineEdit()
        } else {
          event.stopPropagation()
        }
      }

      function onBlur() {
        setTimeout(() => {
          if (inlineEdit && inlineEdit.el === el) commitInlineEdit()
        }, 0)
      }

      function onPaste(event: ClipboardEvent) {
        event.preventDefault()
        const text = event.clipboardData?.getData("text/plain") || ""
        try {
          document.execCommand("insertText", false, text)
        } catch {
          const selection = window.getSelection()
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(text))
            range.collapse(false)
          }
        }
      }

      el.addEventListener("keydown", onKeyDown, true)
      el.addEventListener("blur", onBlur, true)
      el.addEventListener("paste", onPaste, true)

      inlineEdit = {
        el,
        nodeId,
        selectorPath,
        originalText,
        hadContentEditable,
        previousContentEditable,
        previousSpellcheck,
        previousOutline,
        previousOutlineOffset,
        previousCursor,
        onKeyDown,
        onBlur,
        onPaste,
        finishing: false,
      }

      try {
        el.focus({ preventScroll: false })
      } catch {
        el.focus()
      }
      try {
        const range = document.createRange()
        range.selectNodeContents(el)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      } catch {}
    }

    function teardownInlineEdit() {
      if (!inlineEdit) return
      const info = inlineEdit
      const el = info.el
      el.removeEventListener("keydown", info.onKeyDown, true)
      el.removeEventListener("blur", info.onBlur, true)
      el.removeEventListener("paste", info.onPaste, true)
      if (info.hadContentEditable) {
        el.setAttribute(
          "contenteditable",
          info.previousContentEditable == null
            ? ""
            : info.previousContentEditable,
        )
      } else {
        el.removeAttribute("contenteditable")
      }
      if (info.previousSpellcheck == null) {
        el.removeAttribute("spellcheck")
      } else {
        el.setAttribute("spellcheck", info.previousSpellcheck)
      }
      el.style.outline = info.previousOutline || ""
      el.style.outlineOffset = info.previousOutlineOffset || ""
      el.style.cursor = info.previousCursor || ""
      inlineEdit = null
      try {
        window.getSelection()?.removeAllRanges()
      } catch {}
      try {
        el.blur()
      } catch {}
    }

    function readEditableText(el: HTMLElement) {
      let text = ""
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.nodeValue || ""
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as HTMLElement).tagName === "BR"
        ) {
          text += "\n"
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          text += node.textContent || ""
        }
      }
      return text
    }

    function commitInlineEdit() {
      if (!inlineEdit || inlineEdit.finishing) return
      inlineEdit.finishing = true
      const info = inlineEdit
      const newText = readEditableText(info.el)
      teardownInlineEdit()
      if (newText !== info.originalText && info.nodeId) {
        chrome.runtime
          .sendMessage({
            type: "inline-edit-commit",
            nodeId: info.nodeId,
            selectorPath: info.selectorPath,
            original: info.originalText,
            value: newText,
          })
          .catch(() => {})
      }
    }

    function cancelInlineEdit() {
      if (!inlineEdit || inlineEdit.finishing) return
      inlineEdit.finishing = true
      const info = inlineEdit
      info.el.textContent = info.originalText
      teardownInlineEdit()
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
      cancelInlineEdit()
      clearPendingSingleClick()
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
      // Listen on window capture so selection mode wins over page-level
      // document capture handlers such as SPA routers.
      window.addEventListener("click", onClick, true)
      window.addEventListener("dblclick", onDblClick, true)
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
      cancelInlineEdit()
      clearPendingSingleClick()
      active = false
      document.removeEventListener("mouseover", onMouseOver, true)
      document.removeEventListener("mouseout", onMouseOut, true)
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("dblclick", onDblClick, true)
      if (hoveredEl) hoveredEl.style.outline = ""
      hideOverlay()
      hideMeasurements()
      selectedMeasuredEl = null
      if (overlay) overlay.remove()
      overlay = null
      if (measureContainer) measureContainer.remove()
      measureContainer = null
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
            if (node === highlightedEl) showOverlay(node as HTMLElement)
            requestAnimationFrame(() => {
              if (measuredEl) showMeasurementsForEl(measuredEl)
              else if (selectedMeasuredEl)
                showMeasurementsForEl(selectedMeasuredEl)
            })
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
          sendTree(message.selectedNodeId, message.selectedPath)
        } else if (message.type === "show-measurements") {
          const mNode = nodeMap.get(message.nodeId)
          if (mNode) {
            const mEl = mNode.nodeType === Node.TEXT_NODE ? (mNode as Text).parentElement : mNode as HTMLElement
            if (mEl) {
              selectedMeasuredEl = mEl
              showMeasurementsForEl(mEl)
            }
          }
        } else if (message.type === "hide-measurements") {
          selectedMeasuredEl = null
          hideMeasurements()
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
