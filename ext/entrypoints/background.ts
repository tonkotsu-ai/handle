export default defineBackground(() => {
  void chrome.sidePanel.setOptions({ enabled: false })

  const activePanelTabs = new Set<number>()

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

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "open-handle",
      title: "Design with Handle",
      contexts: ["all"]
    })
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
      chrome.tabs
        .sendMessage(tabId, { type: "enable-design-mode" })
        .catch(() => {})
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
      chrome.tabs.sendMessage(tabId, { type })
    }

    if (message.type === "annotate-react") {
      const tabId = sender.tab?.id
      if (!tabId) return
      chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => {
            document
              .querySelectorAll("[data-handle-component]")
              .forEach((n) => n.removeAttribute("data-handle-component"))

            const target = document.querySelector("[data-handle-target]")
            if (!target) return
            target.removeAttribute("data-handle-target")

            function getComponentRootedAt(el: Element): string | null {
              const fiberKey = Object.keys(el).find(
                (k) =>
                  k.startsWith("__reactFiber$") ||
                  k.startsWith("__reactInternalInstance$")
              )
              if (!fiberKey) return null
              let fiber = (el as any)[fiberKey]?.return
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
              return null
            }

            let current: Element | null = target
            while (current && current !== document.documentElement) {
              const component = getComponentRootedAt(current)
              if (component) {
                current.setAttribute("data-handle-component", component)
              }
              current = current.parentElement
            }
          }
        })
        .then(() => {
          chrome.tabs.sendMessage(tabId, { type: "react-annotated" })
        })
      return true
    }

    if (message.type === "annotate-react-tree") {
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

            function getComponentRootedAt(el: Element): string | null {
              const fiberKey = Object.keys(el).find(
                (k) =>
                  k.startsWith("__reactFiber$") ||
                  k.startsWith("__reactInternalInstance$")
              )
              if (!fiberKey) return null
              let fiber = (el as any)[fiberKey]?.return
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
              return null
            }

            // Annotate all body descendants (bounded to prevent perf issues)
            const allEls = document.querySelectorAll("body *")
            const limit = Math.min(allEls.length, 3000)
            for (let i = 0; i < limit; i++) {
              const component = getComponentRootedAt(allEls[i])
              if (component) {
                allEls[i].setAttribute("data-handle-component", component)
              }
            }
          }
        })
        .then(() => {
          chrome.tabs
            .sendMessage(tabId, { type: "react-tree-annotated" })
            .catch(() => {})
        })
        .catch(() => {
          // Script injection failed (e.g. chrome:// pages) — tell content
          // script to build tree without component data
          chrome.tabs
            .sendMessage(tabId, { type: "react-tree-annotated" })
            .catch(() => {})
        })
      return true
    }

    if (message.type === "element-tree") {
      chrome.runtime.sendMessage({
        ...message,
        tabId: sender.tab?.id ?? null
      })
    }
  })
})
