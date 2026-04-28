export default defineBackground(() => {
  void chrome.sidePanel.setOptions({ enabled: false })

  const activePanelTabs = new Set<number>()

  /** Retry sending a message to a tab, waiting for the content script to load */
  async function tabsSendWithRetry(
    tabId: number,
    message: any,
    attempts = 5,
    delay = 200,
  ) {
    for (let i = 0; i < attempts; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, message)
        return
      } catch {
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  function openSidePanel(tabId: number) {
    chrome.sidePanel.setOptions({
      tabId,
      enabled: true,
      path: `sidepanel.html?tabId=${tabId}`
    })
    chrome.sidePanel.open({ tabId }).catch(() => {
      // Ignore failures on unsupported tabs (e.g. chrome:// pages)
    })
  }

  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    openSidePanel(tab.id)
  })

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install" || details.reason === "update") {
      chrome.tabs.create({
        url: "https://gethandle.ai/extension#revision",
      })
    }

    chrome.contextMenus.create({
      id: "open-handle",
      title: "Design with Handle",
      contexts: ["all"],
    })

    // Inject content script into tabs that were open before the extension
    // loaded. Chrome only auto-injects declarative content scripts on new
    // page loads, so pre-existing tabs would have no listener.
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] })
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            files: ["content-scripts/handle.js"],
          })
          .catch(() => {})
      }
    }
  })

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "open-handle" && tab?.id) {
      openSidePanel(tab.id)
    }
  })

  // Track sidepanel connections — disable design mode when panel closes
  chrome.runtime.onConnect.addListener((port) => {
    if (!port.name.startsWith("sidepanel:")) return
    const tabId = parseInt(port.name.split(":")[1])
    if (isNaN(tabId)) return
    activePanelTabs.add(tabId)
    port.onDisconnect.addListener(() => {
      activePanelTabs.delete(tabId)
      chrome.tabs
        .sendMessage(tabId, { type: "disable-design-mode" })
        .catch(() => {})
    })
  })

  // Re-enable design mode after page refresh when sidepanel is open
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "complete" && activePanelTabs.has(tabId)) {
      tabsSendWithRetry(tabId, { type: "enable-design-mode" })
      chrome.runtime
        .sendMessage({ type: "tab-refreshed", tabId })
        .catch(() => {})
    }
  })

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "toggle-design-mode") {
      const tabId = message.tabId
      const type = message.enabled
        ? "enable-design-mode"
        : "disable-design-mode"
      tabsSendWithRetry(tabId, { type })
    }

    if (message.type === "annotate-components") {
      const tabId = sender.tab?.id
      if (!tabId) return
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            const target = document.querySelector("[data-handle-target]")
            if (!target) return
            target.removeAttribute("data-handle-target")

            function detectComponent(el: Element): string | null {
              // React
              const reactKey = Object.keys(el).find(
                (k) =>
                  k.startsWith("__reactFiber$") ||
                  k.startsWith("__reactInternalInstance$")
              )
              if (reactKey) {
                let fiber = (el as any)[reactKey]?.return
                while (fiber) {
                  if (typeof fiber.type === "string") break
                  if (
                    typeof fiber.type === "function" ||
                    typeof fiber.type === "object"
                  ) {
                    const name =
                      fiber.type.displayName || fiber.type.name || null
                    if (name) return name
                  }
                  fiber = fiber.return
                }
              }

              const elAny = el as any

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
                  elAny.__vue__.$options?.name ||
                  elAny.__vue__.$options?._componentTag
                if (name) return name
              }

              // Angular (dev mode)
              if (typeof (globalThis as any).ng !== "undefined") {
                try {
                  const comp = (globalThis as any).ng.getComponent(el)
                  if (comp) {
                    const raw = comp.constructor?.name
                    if (raw && raw !== "Object") {
                      return raw.replace(/^_+/, "")
                    }
                  }
                } catch {}
              }

              // Svelte (dev mode)
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

            let current: Element | null = target
            while (current && current !== document.documentElement) {
              const component = detectComponent(current)
              if (component) {
                current.setAttribute("data-handle-component", component)
              }
              current = current.parentElement
            }
          }
        })
        .then(() => {
          chrome.tabs.sendMessage(tabId, { type: "components-annotated" })
        })
      return true
    }

    if (message.type === "annotate-component-tree") {
      const tabId = sender.tab?.id
      if (!tabId) return
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            // Clear stale annotations
            document
              .querySelectorAll("[data-handle-component]")
              .forEach((n) => n.removeAttribute("data-handle-component"))

            function detectComponent(el: Element): string | null {
              // React
              const reactKey = Object.keys(el).find(
                (k) =>
                  k.startsWith("__reactFiber$") ||
                  k.startsWith("__reactInternalInstance$")
              )
              if (reactKey) {
                let fiber = (el as any)[reactKey]?.return
                while (fiber) {
                  if (typeof fiber.type === "string") break
                  if (
                    typeof fiber.type === "function" ||
                    typeof fiber.type === "object"
                  ) {
                    const name =
                      fiber.type.displayName || fiber.type.name || null
                    if (name) return name
                  }
                  fiber = fiber.return
                }
              }

              const elAny = el as any

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
                  elAny.__vue__.$options?.name ||
                  elAny.__vue__.$options?._componentTag
                if (name) return name
              }

              // Angular (dev mode)
              if (typeof (globalThis as any).ng !== "undefined") {
                try {
                  const comp = (globalThis as any).ng.getComponent(el)
                  if (comp) {
                    const raw = comp.constructor?.name
                    if (raw && raw !== "Object") {
                      return raw.replace(/^_+/, "")
                    }
                  }
                } catch {}
              }

              // Svelte (dev mode)
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

            // Annotate all body descendants (bounded to prevent perf issues)
            const allEls = document.querySelectorAll("body *")
            const limit = Math.min(allEls.length, 3000)
            for (let i = 0; i < limit; i++) {
              const component = detectComponent(allEls[i])
              if (component) {
                allEls[i].setAttribute("data-handle-component", component)
              }
            }
          }
        })
        .then(() => {
          chrome.tabs
            .sendMessage(tabId, { type: "component-tree-annotated" })
            .catch(() => {})
        })
        .catch(() => {
          // Script injection failed (e.g. chrome:// pages) — tell content
          // script to build tree without component data
          chrome.tabs
            .sendMessage(tabId, { type: "component-tree-annotated" })
            .catch(() => {})
        })
      return true
    }

    if (
      message.type === "element-tree" ||
      message.type === "inline-edit-commit"
    ) {
      chrome.runtime.sendMessage({
        ...message,
        tabId: sender.tab?.id ?? null
      }).catch(() => {})
    }
  })
})
