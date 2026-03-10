void chrome.sidePanel.setOptions({ enabled: false })

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id
  if (!tabId) return

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: true,
      path: `sidepanel.html?tabId=${tabId}`
    })
    await chrome.sidePanel.open({ tabId })
  } catch {
    // Ignore failures on unsupported tabs (e.g. chrome:// pages)
  }
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
            .querySelectorAll("[data-palette-component]")
            .forEach((n) => n.removeAttribute("data-palette-component"))

          const target = document.querySelector("[data-palette-target]")
          if (!target) return
          target.removeAttribute("data-palette-target")

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
              el.setAttribute("data-palette-component", component)
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
