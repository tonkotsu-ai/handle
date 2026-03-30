/**
 * Tests that expose race conditions in the Chrome extension's DOM tree loading
 * flow. Uses async message simulation to model real Chrome runtime behavior
 * where messages between content script, background, and sidepanel are async.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { buildDomTree } from "./dom"
import type { TreeNode } from "../types"

interface TimingConfig {
  /** ms before content script's onMessage listener is ready */
  csListenerDelay: number
  /** ms for background to relay messages (simulates Chrome IPC) */
  bgRelayDelay: number
  /** ms before sidepanel's onMessage listener is ready */
  spListenerDelay: number
}

const DEFAULT_TIMING: TimingConfig = {
  csListenerDelay: 0,
  bgRelayDelay: 1,
  spListenerDelay: 0,
}

/**
 * Creates an async extension simulation that models real Chrome message passing.
 * Unlike the synchronous simulation in message-flow.test.ts, messages are
 * delivered asynchronously with configurable delays.
 */
function createAsyncExtensionSimulation(timing: TimingConfig = DEFAULT_TIMING) {
  // Content script state
  let csListenerReady = false
  let csActive = false
  let nodeMap = new Map<string, Node>()

  // SidePanel state
  let spListenerReady = false
  let spTree: TreeNode | null = null
  let spSelectedNodeId: string | null = null
  let spTreeReceivedCount = 0

  // Background state
  const activePanelTabs = new Set<number>()

  // Track unhandled rejections (simulating missing .catch())
  const unhandledRejections: Error[] = []

  // Simulate chrome.tabs.sendMessage — rejects if content script listener not ready
  function tabsSendMessage(tabId: number, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!csListenerReady) {
          reject(
            new Error(
              "Could not establish connection. Receiving end does not exist.",
            ),
          )
        } else {
          csOnMessage(message)
          resolve()
        }
      }, timing.bgRelayDelay)
    })
  }

  // Simulate chrome.runtime.sendMessage from content script → background + sidepanel
  function runtimeSendMessageFromCS(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Background handler
        bgOnMessage(message, { tab: { id: 1 } })
        resolve()
      }, timing.bgRelayDelay)
    })
  }

  // Simulate chrome.runtime.sendMessage from background → sidepanel
  // This is the relay — rejects if no sidepanel listener
  function runtimeSendMessageFromBG(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!spListenerReady) {
          reject(
            new Error(
              "Could not establish connection. Receiving end does not exist.",
            ),
          )
        } else {
          spOnMessage(message)
          resolve()
        }
      }, timing.bgRelayDelay)
    })
  }

  // --- Content script handlers ---

  function rebuildTree(): TreeNode | null {
    const result = buildDomTree(document.body, {
      isOverlay: () => false,
      detectComponent: (el) =>
        el.getAttribute("data-handle-component") || null,
    })
    nodeMap = result.nodeMap
    return result.tree
  }

  function sendTree() {
    const tree = rebuildTree()
    runtimeSendMessageFromCS({
      type: "element-tree",
      tree,
      selectedNodeId: null,
      selectedPath: null,
    }).catch(() => {})
  }

  function csOnMessage(message: any) {
    if (message.type === "enable-design-mode") {
      if (csActive) return
      csActive = true
      sendTree()
    } else if (message.type === "component-tree-annotated") {
      sendTree()
    }
  }

  // --- Background handlers ---

  function bgOnMessage(message: any, sender: any) {
    if (message.type === "toggle-design-mode") {
      const tabId = message.tabId
      const type = message.enabled
        ? "enable-design-mode"
        : "disable-design-mode"
      // BUG 1: No .catch() — mirrors background.ts line 68
      tabsSendMessage(tabId, { type }).catch((err) => {
        unhandledRejections.push(err)
      })
    }

    if (message.type === "element-tree") {
      // BUG 2: No .catch() — mirrors background.ts line 277
      runtimeSendMessageFromBG({
        ...message,
        tabId: sender.tab?.id ?? null,
      }).catch((err) => {
        unhandledRejections.push(err)
      })
    }
  }

  // --- SidePanel handlers ---

  function spOnMessage(message: any) {
    if (message.type === "element-tree") {
      const tabId = 1
      if (tabId != null && message.tabId !== tabId) return
      spTree = message.tree
      spSelectedNodeId = message.selectedNodeId
      spTreeReceivedCount++
    }
  }

  return {
    // Lifecycle controls (simulate startup timing)
    registerCSListener() {
      csListenerReady = true
    },
    registerSPListener() {
      spListenerReady = true
    },
    unregisterCSListener() {
      csListenerReady = false
      csActive = false
    },
    addPanelTab(tabId: number) {
      activePanelTabs.add(tabId)
    },

    // Actions
    /** SidePanel sends toggle-design-mode (simulates useEffect at line 422) */
    enableDesignMode() {
      bgOnMessage(
        { type: "toggle-design-mode", enabled: true, tabId: 1 },
        {},
      )
    },
    /** Background sends enable-design-mode after page refresh (simulates line 51-55) */
    simulatePageRefresh() {
      csListenerReady = false
      csActive = false
      // Simulate tabs.onUpdated with status: "complete"
      if (activePanelTabs.has(1)) {
        tabsSendMessage(1, { type: "enable-design-mode" }).catch(() => {})
      }
    },
    /** Register content script listener after a delay (simulates document_idle) */
    async registerCSListenerAfterDelay() {
      await new Promise((r) => setTimeout(r, timing.csListenerDelay))
      csListenerReady = true
    },
    /** Register sidepanel listener after a delay (simulates React useEffect) */
    async registerSPListenerAfterDelay() {
      await new Promise((r) => setTimeout(r, timing.spListenerDelay))
      spListenerReady = true
    },

    // State accessors
    get spTree() {
      return spTree
    },
    get spSelectedNodeId() {
      return spSelectedNodeId
    },
    get spTreeReceivedCount() {
      return spTreeReceivedCount
    },
    get unhandledRejections() {
      return unhandledRejections
    },
    get csActive() {
      return csActive
    },

    // Reset
    reset() {
      csListenerReady = false
      csActive = false
      spListenerReady = false
      spTree = null
      spSelectedNodeId = null
      spTreeReceivedCount = 0
      nodeMap.clear()
      unhandledRejections.length = 0
      activePanelTabs.clear()
    },
  }
}

/** Flush all pending timers and microtasks */
async function flush(ms = 100) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe("extension message flow — race conditions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div id="app"><header><h1>Handle</h1></header><main><p>Welcome</p></main></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  describe("Bug 1: content script not ready when enable-design-mode arrives", () => {
    it("loses the tree when content script listener is not registered", async () => {
      const ext = createAsyncExtensionSimulation({
        csListenerDelay: 50,
        bgRelayDelay: 1,
        spListenerDelay: 0,
      })

      // SidePanel listener is ready
      ext.registerSPListener()

      // Content script listener is NOT ready yet (simulating document_idle delay)
      // SidePanel triggers design mode immediately
      ext.enableDesignMode()

      // Wait for all messages to propagate
      await flush(200)

      // BUG: Tree was never received because enable-design-mode was lost
      expect(ext.spTree).toBeNull()
      expect(ext.spTreeReceivedCount).toBe(0)
      expect(ext.unhandledRejections.length).toBeGreaterThan(0)
      expect(ext.unhandledRejections[0].message).toContain(
        "Could not establish connection",
      )
    })

    it("works when content script listener is registered first", async () => {
      const ext = createAsyncExtensionSimulation({
        csListenerDelay: 0,
        bgRelayDelay: 1,
        spListenerDelay: 0,
      })

      ext.registerCSListener()
      ext.registerSPListener()
      ext.enableDesignMode()

      await flush(200)

      // Tree should be received
      expect(ext.spTree).not.toBeNull()
      expect(ext.spTree!.tag).toBe("body")
      expect(ext.spTreeReceivedCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe("Bug 2: sidepanel listener not ready when element-tree arrives", () => {
    it("loses the tree when sidepanel listener is not registered", async () => {
      const ext = createAsyncExtensionSimulation({
        csListenerDelay: 0,
        bgRelayDelay: 1,
        spListenerDelay: 50,
      })

      // Content script is ready, but sidepanel listener is NOT
      ext.registerCSListener()

      ext.enableDesignMode()

      // Wait for messages to propagate (but sidepanel listener not ready)
      await flush(10)

      // BUG: Tree was sent but sidepanel couldn't receive it
      expect(ext.spTree).toBeNull()
      expect(ext.spTreeReceivedCount).toBe(0)
      expect(ext.unhandledRejections.length).toBeGreaterThan(0)
    })
  })

  describe("Bug 3: page refresh — content script not re-injected yet", () => {
    it("loses the tree on page refresh when content script is slow to re-inject", async () => {
      const ext = createAsyncExtensionSimulation({
        csListenerDelay: 0,
        bgRelayDelay: 1,
        spListenerDelay: 0,
      })

      // Initial setup: everything works
      ext.registerCSListener()
      ext.registerSPListener()
      ext.addPanelTab(1)
      ext.enableDesignMode()
      await flush(200)

      expect(ext.spTree).not.toBeNull()
      const initialCount = ext.spTreeReceivedCount

      // Page refresh: content script is unloaded then slowly re-injected
      ext.simulatePageRefresh()

      // Wait for the enable-design-mode attempt (content script not ready)
      await flush(200)

      // The tree count should not have increased — the message was lost
      expect(ext.spTreeReceivedCount).toBe(initialCount)
    })
  })

  describe("Bug 4: repeated loads with varying timing", () => {
    it("succeeds every time when both listeners are ready before enable", async () => {
      const ext = createAsyncExtensionSimulation({
        csListenerDelay: 0,
        bgRelayDelay: 1,
        spListenerDelay: 0,
      })

      const iterations = 20
      let successes = 0

      for (let i = 0; i < iterations; i++) {
        ext.reset()
        document.body.innerHTML =
          `<div id="app-${i}"><h1>Iteration ${i}</h1></div>`

        ext.registerCSListener()
        ext.registerSPListener()
        ext.enableDesignMode()

        await flush(200)

        if (ext.spTree != null) successes++
      }

      expect(successes).toBe(iterations)
    })

    it("fails some iterations when content script has random startup delay", async () => {
      // This test demonstrates the intermittent nature of the bug:
      // with random delays, sometimes the content script is ready in time,
      // sometimes it isn't.
      const iterations = 20
      let successes = 0
      let failures = 0

      for (let i = 0; i < iterations; i++) {
        // Alternate between fast and slow content script registration
        const csDelay = i % 2 === 0 ? 0 : 10
        const ext = createAsyncExtensionSimulation({
          csListenerDelay: csDelay,
          bgRelayDelay: 1,
          spListenerDelay: 0,
        })

        document.body.innerHTML =
          `<div id="app-${i}"><h1>Iteration ${i}</h1></div>`

        ext.registerSPListener()

        // Content script registers after its delay
        const csReady = ext.registerCSListenerAfterDelay()

        // SidePanel enables design mode immediately (doesn't wait for CS)
        ext.enableDesignMode()

        // Wait for everything
        await flush(200)
        await csReady

        if (ext.spTree != null) {
          successes++
        } else {
          failures++
        }
      }

      // With delay=0 (even iterations), it should work.
      // With delay=10 (odd iterations), enable-design-mode arrives before
      // the content script is ready, so the message is lost.
      expect(successes).toBe(10) // Only the fast ones succeed
      expect(failures).toBe(10) // The slow ones fail
    })
  })
})

/**
 * Simulation WITH retry logic applied — demonstrates the fix works.
 */
function createAsyncExtensionSimulationWithRetry(
  timing: TimingConfig = DEFAULT_TIMING,
) {
  let csListenerReady = false
  let csActive = false
  let nodeMap = new Map<string, Node>()

  let spListenerReady = false
  let spTree: TreeNode | null = null
  let spTreeReceivedCount = 0

  const activePanelTabs = new Set<number>()

  function tabsSendMessage(tabId: number, message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!csListenerReady) {
          reject(
            new Error(
              "Could not establish connection. Receiving end does not exist.",
            ),
          )
        } else {
          csOnMessage(message)
          resolve()
        }
      }, timing.bgRelayDelay)
    })
  }

  function runtimeSendMessageFromCS(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        bgOnMessage(message, { tab: { id: 1 } })
        resolve()
      }, timing.bgRelayDelay)
    })
  }

  function runtimeSendMessageFromBG(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!spListenerReady) {
          reject(
            new Error(
              "Could not establish connection. Receiving end does not exist.",
            ),
          )
        } else {
          spOnMessage(message)
          resolve()
        }
      }, timing.bgRelayDelay)
    })
  }

  // FIX: retry helper
  async function sendWithRetry(
    fn: () => Promise<void>,
    attempts = 3,
    delay = 50,
  ) {
    for (let i = 0; i < attempts; i++) {
      try {
        await fn()
        return
      } catch {
        if (i < attempts - 1)
          await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  function rebuildTree(): TreeNode | null {
    const result = buildDomTree(document.body, {
      isOverlay: () => false,
      detectComponent: (el) =>
        el.getAttribute("data-handle-component") || null,
    })
    nodeMap = result.nodeMap
    return result.tree
  }

  function sendTree() {
    const tree = rebuildTree()
    runtimeSendMessageFromCS({
      type: "element-tree",
      tree,
      selectedNodeId: null,
      selectedPath: null,
    }).catch(() => {})
  }

  function csOnMessage(message: any) {
    if (message.type === "enable-design-mode") {
      if (csActive) return
      csActive = true
      sendTree()
    }
  }

  function bgOnMessage(message: any, sender: any) {
    if (message.type === "toggle-design-mode") {
      const tabId = message.tabId
      const type = message.enabled
        ? "enable-design-mode"
        : "disable-design-mode"
      // FIX: retry on failure
      sendWithRetry(() => tabsSendMessage(tabId, { type }))
    }

    if (message.type === "element-tree") {
      // FIX: catch errors
      runtimeSendMessageFromBG({
        ...message,
        tabId: sender.tab?.id ?? null,
      }).catch(() => {})
    }
  }

  function spOnMessage(message: any) {
    if (message.type === "element-tree") {
      const tabId = 1
      if (tabId != null && message.tabId !== tabId) return
      spTree = message.tree
      spTreeReceivedCount++
    }
  }

  return {
    registerCSListener() {
      csListenerReady = true
    },
    registerSPListener() {
      spListenerReady = true
    },
    addPanelTab(tabId: number) {
      activePanelTabs.add(tabId)
    },
    enableDesignMode() {
      bgOnMessage(
        { type: "toggle-design-mode", enabled: true, tabId: 1 },
        {},
      )
    },
    async registerCSListenerAfterDelay() {
      await new Promise((r) => setTimeout(r, timing.csListenerDelay))
      csListenerReady = true
    },
    async registerSPListenerAfterDelay() {
      await new Promise((r) => setTimeout(r, timing.spListenerDelay))
      spListenerReady = true
    },
    get spTree() {
      return spTree
    },
    get spTreeReceivedCount() {
      return spTreeReceivedCount
    },
    reset() {
      csListenerReady = false
      csActive = false
      spListenerReady = false
      spTree = null
      spTreeReceivedCount = 0
      nodeMap.clear()
      activePanelTabs.clear()
    },
  }
}

describe("extension message flow — with retry fix", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div id="app"><header><h1>Handle</h1></header><main><p>Welcome</p></main></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("retries and succeeds when content script registers late", async () => {
    const ext = createAsyncExtensionSimulationWithRetry({
      csListenerDelay: 30,
      bgRelayDelay: 1,
      spListenerDelay: 0,
    })

    ext.registerSPListener()

    // Content script registers after 30ms
    const csReady = ext.registerCSListenerAfterDelay()

    // SidePanel enables design mode immediately
    ext.enableDesignMode()

    // Let retries happen (retry delay is 50ms, so first retry at ~52ms)
    await flush(500)
    await csReady

    // With retry, the tree should eventually be received
    expect(ext.spTree).not.toBeNull()
    expect(ext.spTree!.tag).toBe("body")
    expect(ext.spTreeReceivedCount).toBeGreaterThanOrEqual(1)
  })

  it("succeeds every iteration with random content script delays", async () => {
    const iterations = 20
    let successes = 0

    for (let i = 0; i < iterations; i++) {
      const csDelay = i % 2 === 0 ? 0 : 30
      const ext = createAsyncExtensionSimulationWithRetry({
        csListenerDelay: csDelay,
        bgRelayDelay: 1,
        spListenerDelay: 0,
      })

      document.body.innerHTML =
        `<div id="app-${i}"><h1>Iteration ${i}</h1></div>`

      ext.registerSPListener()
      const csReady = ext.registerCSListenerAfterDelay()
      ext.enableDesignMode()

      await flush(500)
      await csReady

      if (ext.spTree != null) successes++
    }

    // All iterations should succeed with retry
    expect(successes).toBe(iterations)
  })
})
