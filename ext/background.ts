void chrome.sidePanel.setOptions({ enabled: false })

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id
  if (!tabId) return

  // setOptions + open must both be called synchronously inside the user
  // gesture handler — awaiting setOptions first loses the gesture context
  // and causes "sidePanel.open() may only be called in response to a user
  // gesture". Chrome processes these sequentially, so the options are
  // applied before the panel actually renders.
  chrome.sidePanel.setOptions({
    tabId,
    enabled: true,
    path: `sidepanel.html?tabId=${tabId}`
  })
  chrome.sidePanel.open({ tabId }).catch(() => {
    // Ignore failures on unsupported tabs (e.g. chrome:// pages)
  })
})

// Track sidepanel connections — disable design mode when panel closes
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith("sidepanel:")) return
  const tabId = parseInt(port.name.split(":")[1])
  if (isNaN(tabId)) return
  port.onDisconnect.addListener(() => {
    chrome.tabs.sendMessage(tabId, { type: "disable-design-mode" }).catch(() => {})
  })
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "toggle-design-mode") {
    const tabId = message.tabId
    const type = message.enabled ? "enable-design-mode" : "disable-design-mode"
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

          function getNearestComponent(el: Element): string | null {
            const fiberKey = Object.keys(el).find(
              (k) =>
                k.startsWith("__reactFiber$") ||
                k.startsWith("__reactInternalInstance$")
            )
            if (!fiberKey) return null
            let fiber = (el as any)[fiberKey]
            while (fiber) {
              if (
                typeof fiber.type === "function" ||
                typeof fiber.type === "object"
              ) {
                return fiber.type.displayName || fiber.type.name || null
              }
              fiber = fiber.return
            }
            return null
          }

          const entries: { el: Element; component: string | null }[] = []
          let current: Element | null = target
          while (current && current !== document.documentElement) {
            entries.push({ el: current, component: getNearestComponent(current) })
            current = current.parentElement
          }

          const seen = new Set<string>()
          for (let i = entries.length - 1; i >= 0; i--) {
            const { el, component } = entries[i]
            if (component && !seen.has(component)) {
              seen.add(component)
              el.setAttribute("data-handle-component", component)
            }
          }
        }
      })
      .then(() => {
        chrome.tabs.sendMessage(tabId, { type: "react-annotated" })
      })
    return true
  }

  if (message.type === "element-hierarchy") {
    chrome.runtime.sendMessage({
      ...message,
      tabId: sender.tab?.id ?? null
    })
  }
})

export {}
