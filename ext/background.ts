void chrome.sidePanel.setOptions({ enabled: false })

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

          // For a given DOM element, find the component whose outermost
          // DOM node is this element.  Walk up the fiber's return chain:
          // if we hit a component fiber before another host (DOM) fiber,
          // this element is that component's root element.
          function getComponentRootedAt(el: Element): string | null {
            const fiberKey = Object.keys(el).find(
              (k) =>
                k.startsWith("__reactFiber$") ||
                k.startsWith("__reactInternalInstance$")
            )
            if (!fiberKey) return null
            let fiber = (el as any)[fiberKey]?.return
            while (fiber) {
              // Hit another DOM element fiber — this element is not
              // the outermost element of any component above it
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

  if (message.type === "element-hierarchy") {
    chrome.runtime.sendMessage({
      ...message,
      tabId: sender.tab?.id ?? null
    })
  }
})

export {}
