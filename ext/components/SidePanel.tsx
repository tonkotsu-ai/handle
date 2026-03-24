import { Diff, GripHorizontal, MessageSquare, MousePointer2, PencilLine } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import "~style.css"

import {
  ElementRow,
  StyleEditor,
  getIconSvgChildren,
  useEditTracker,
} from "@handle-ai/handle-shared"
import type { ElementId, ElementMeta, TreeNode } from "@handle-ai/handle-shared"

import type { SessionInfo, StyleData } from "~types"

import { AnalyticEvent, initStatsig, logEvent } from "~lib/statsig"

import SendBar from "./SendBar"

const DISCOVERY_URL = "http://localhost:58932/api/sessions"
const POLL_INTERVAL = 3000

/** Fallback clipboard write using a temporary textarea + execCommand("copy").
 *  Works even when the sidepanel document doesn't have focus (e.g. during
 *  page navigation) where navigator.clipboard.writeText would reject. */
function execCopy(text: string) {
  const ta = document.createElement("textarea")
  ta.value = text
  ta.style.position = "fixed"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  ta.focus()
  ta.select()
  document.execCommand("copy")
  document.body.removeChild(ta)
}

function buildParentMap(tree: TreeNode): Map<string, string> {
  const map = new Map<string, string>()
  function walk(node: TreeNode) {
    for (const child of node.children) {
      map.set(child.nodeId, node.nodeId)
      walk(child)
    }
  }
  walk(tree)
  return map
}

function collectExpandedAtDepth(tree: TreeNode, maxDepth: number): Set<string> {
  const set = new Set<string>()
  function walk(node: TreeNode, depth: number) {
    if (depth <= maxDepth) set.add(node.nodeId)
    if (depth < maxDepth) {
      for (const child of node.children) walk(child, depth + 1)
    }
  }
  walk(tree, 0)
  return set
}

function findNode(tree: TreeNode, nodeId: string): TreeNode | null {
  if (tree.nodeId === nodeId) return tree
  for (const child of tree.children) {
    const found = findNode(child, nodeId)
    if (found) return found
  }
  return null
}

function findNearestAncestorComponent(
  tree: TreeNode,
  nodeId: string,
): string | null {
  const path: TreeNode[] = []
  function dfs(node: TreeNode): boolean {
    path.push(node)
    if (node.nodeId === nodeId) return true
    for (const child of node.children) {
      if (dfs(child)) return true
    }
    path.pop()
    return false
  }
  dfs(tree)
  for (let i = path.length - 2; i >= 0; i--) {
    if (path[i].component) return path[i].component
  }
  return null
}

function getComponentPath(
  tree: TreeNode,
  nodeId: string,
): string | null {
  const path: TreeNode[] = []
  function dfs(node: TreeNode): boolean {
    path.push(node)
    if (node.nodeId === nodeId) return true
    for (const child of node.children) {
      if (dfs(child)) return true
    }
    path.pop()
    return false
  }
  if (!dfs(tree)) return null

  // Find the nearest component ancestor (or the node itself)
  let stopIdx = 0
  const node = path[path.length - 1]
  if (node?.component) {
    stopIdx = path.length - 1
  } else {
    for (let i = path.length - 2; i >= 0; i--) {
      if (path[i].component) {
        stopIdx = i
        break
      }
    }
  }

  const parts: string[] = []
  for (let i = stopIdx; i < path.length; i++) {
    const p = path[i]
    parts.push(p.component || `${p.tag}${p.id}${p.classes}`)
  }
  return parts.join(" > ")
}

/** DFS walk returning visible tree nodes with their depth for flat rendering */
function flattenVisibleTree(
  tree: TreeNode,
  expandedNodes: Set<string>,
): Array<{ node: TreeNode; depth: number }> {
  const result: Array<{ node: TreeNode; depth: number }> = []
  function walk(node: TreeNode, depth: number) {
    result.push({ node, depth })
    if (expandedNodes.has(node.nodeId)) {
      for (const child of node.children) {
        walk(child, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return result
}

// Demo tree structure (matching the old demo hierarchy but as a recursive tree)
const DEMO_TREE: TreeNode = {
  nodeId: "5",
  tag: "body",
  id: "",
  classes: "",
  component: null,
  childCount: 1,
  selectorPath: "body",
  children: [
    {
      nodeId: "4",
      tag: "div",
      id: "#app",
      classes: ".min-h-screen.bg-gray-50",
      component: "App",
      childCount: 1,
      selectorPath: "body > div#app",
      children: [
        {
          nodeId: "3",
          tag: "main",
          id: "",
          classes: ".flex.flex-col.items-center.gap-8",
          component: null,
          childCount: 1,
          selectorPath:
            "body > div#app > main.flex.flex-col.items-center.gap-8",
          children: [
            {
              nodeId: "2",
              tag: "div",
              id: "",
              classes: ".card.p-6.rounded-xl.shadow-md",
              component: "ProfileCard",
              childCount: 1,
              selectorPath:
                "body > div#app > main.flex.flex-col.items-center.gap-8 > div.card.p-6.rounded-xl.shadow-md",
              children: [
                {
                  nodeId: "1",
                  tag: "div",
                  id: "",
                  classes: ".flex.flex-col.gap-2",
                  component: null,
                  childCount: 1,
                  selectorPath:
                    "body > div#app > main.flex.flex-col.items-center.gap-8 > div.card.p-6.rounded-xl.shadow-md > div.flex.flex-col.gap-2",
                  children: [
                    {
                      nodeId: "0",
                      tag: "h3",
                      id: "",
                      classes: ".text-lg.font-semibold",
                      component: null,
                      childCount: 0,
                      selectorPath:
                        "body > div#app > main.flex.flex-col.items-center.gap-8 > div.card.p-6.rounded-xl.shadow-md > div.flex.flex-col.gap-2 > h3.text-lg.font-semibold",
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const DEMO_STYLES: Record<string, StyleData> = {
  "0": {
    display: "block",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "600",
    fontSize: "18px",
    borderRadius: "0px",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
    textContent: "Jane Cooper",
  },
  "1": {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
    alignItems: "center",
  },
  "2": {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "24px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: "1px",
    borderStyle: "solid",
    alignItems: "center",
  },
  "3": {
    display: "flex",
    flexDirection: "column",
    gap: "32px",
    padding: "48px 16px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
    alignItems: "center",
  },
  "4": {
    display: "block",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "#f9fafb",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
  },
  "5": {
    display: "block",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "#ffffff",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
  },
}

export interface SidePanelProps {
  demo?: boolean
}

function getTabIdFromLocation() {
  if (typeof window === "undefined") return null
  const value = new URLSearchParams(window.location.search).get("tabId")
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

function SidePanel({ demo = false }: SidePanelProps) {
  const [tree, setTree] = useState<TreeNode | null>(demo ? DEMO_TREE : null)
  const [tabId, setTabId] = useState<number | null>(() =>
    demo ? null : getTabIdFromLocation(),
  )
  const [selectionMode, setSelectionMode] = useState(true)
  const [selectionKey, setSelectionKey] = useState(0)
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(
    null,
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    demo ? "0" : null,
  )
  const [selectedStyles, setSelectedStyles] = useState<StyleData | null>(
    demo ? DEMO_STYLES["0"] : null,
  )
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    demo ? collectExpandedAtDepth(DEMO_TREE, 1) : new Set(),
  )
  const [pageTokens, setPageTokens] = useState<
    Array<{ name: string; value: string }>
  >([])
  const [pageColors, setPageColors] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const treeRef = useRef<TreeNode | null>(demo ? DEMO_TREE : null)
  const parentMapRef = useRef<Map<string, string>>(new Map())
  const selectorPathCacheRef = useRef<Map<string, string>>(new Map())
  const styleRequestIdRef = useRef(0)
  const socketRef = useRef<Socket | null>(null)
  const callbackRef = useRef<((response: { content: string }) => void) | null>(
    null,
  )
  const [agentName, setAgentName] = useState<string | null>(null)

  // Shared edit tracking hook
  const {
    editsRef,
    changeCount,
    recordEdit,
    recomputeChangeCount,
    hasEditsForElement,
    getEditedPropsForElement,
    generateFeedbackDescription,
    resetEdits,
  } = useEditTracker({
    resolvePath: (elementId: ElementId) => {
      const nodeId = elementId as string
      const t = treeRef.current
      if (!t) return undefined
      const node = findNode(t, nodeId)
      return node?.selectorPath
    },
    resolveElementMeta: (elementId: ElementId): ElementMeta => {
      const nodeId = elementId as string
      const t = treeRef.current
      if (!t) {
        return {
          selector: `element[${nodeId}]`,
          component: null,
          componentPath: null,
        }
      }
      const node = findNode(t, nodeId)
      const selector = node
        ? `${node.tag}${node.id}${node.classes}`
        : `element[${nodeId}]`
      const component = node?.component
        ? node.component
        : findNearestAncestorComponent(t, nodeId)
      const componentPath = getComponentPath(t, nodeId)
      return { selector, component, componentPath }
    },
  })

  // Initialize Statsig analytics
  useEffect(() => {
    if (demo) return
    initStatsig()
  }, [demo])

  // Resolve tab id: prefer sidepanel URL query, fallback to current active tab
  useEffect(() => {
    if (demo || tabId != null) return
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) setTabId(tab.id)
    })
  }, [demo, tabId])

  // Toggle design mode on/off
  const setDesignMode = useCallback(
    (enabled: boolean) => {
      if (!demo && tabId) {
        chrome.runtime.sendMessage({
          type: "toggle-design-mode",
          enabled,
          tabId,
        })
      }
    },
    [demo, tabId],
  )

  // Enable/disable design mode based on selectionMode and panel lifecycle
  useEffect(() => {
    if (demo || tabId == null) return
    setDesignMode(selectionMode)
    return () => setDesignMode(false)
  }, [demo, tabId, setDesignMode, selectionMode])

  // Log panel open/close analytics
  useEffect(() => {
    if (demo || tabId == null) return
    logEvent(AnalyticEvent.SidepanelOpened)
    return () => logEvent(AnalyticEvent.SidepanelClosed)
  }, [demo, tabId])

  // Fetch page tokens and colors once for color picker display
  useEffect(() => {
    if (demo || tabId == null) return
    chrome.tabs
      .sendMessage(tabId, { type: "get-page-tokens" })
      .then((tokens) => {
        if (Array.isArray(tokens)) setPageTokens(tokens)
      })
      .catch(() => {})
    chrome.tabs
      .sendMessage(tabId, { type: "get-page-colors" })
      .then((colors) => {
        if (Array.isArray(colors)) setPageColors(colors)
      })
      .catch(() => {})
  }, [demo, tabId])

  // Connect a port so background can detect panel closure
  useEffect(() => {
    if (demo || tabId == null) return
    const port = chrome.runtime.connect({ name: `sidepanel:${tabId}` })
    return () => port.disconnect()
  }, [demo, tabId])

  const copyToClipboard = useCallback((text: string) => {
    if (document.hasFocus()) {
      navigator.clipboard.writeText(text).catch(() => {
        execCopy(text)
      })
    } else {
      execCopy(text)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    let content = generateFeedbackDescription()
    if (tabId != null) {
      try {
        const tab = await chrome.tabs.get(tabId)
        if (tab.url) {
          content = `The following feedback is in reference to ${tab.url}\n\n${content}`
        }
      } catch {}
    }
    copyToClipboard(content)
    logEvent(AnalyticEvent.ChangesCopied, undefined, {
      changeCount: String(changeCount),
    })
  }, [changeCount, tabId])

  const handleCancel = useCallback(() => {
    const content = "No design feedback was given."

    if (callbackRef.current) {
      callbackRef.current({ content })
      callbackRef.current = null
    } else if (socketRef.current?.connected) {
      socketRef.current.emit("design_feedback", { content })
    }

    logEvent(AnalyticEvent.ChangesCancelled)
  }, [])

  const handleSend = useCallback(async () => {
    if (changeCount === 0 || !selectedSession) return

    let content = generateFeedbackDescription()

    if (tabId != null) {
      try {
        const tab = await chrome.tabs.get(tabId)
        if (tab.url) {
          content = `The following feedback is in reference to ${tab.url}\n\n${content}`
        }
      } catch {}
    }

    if (callbackRef.current) {
      callbackRef.current({ content })
      callbackRef.current = null
    } else if (socketRef.current?.connected) {
      socketRef.current.emit("design_feedback", { content })
    }

    logEvent(AnalyticEvent.ChangesSent, undefined, {
      changeCount: String(changeCount),
    })

    resetEdits()
  }, [changeCount, selectedSession])

  const handleStyleEdit = useCallback(
    (elementId: ElementId, prop: string, original: string, value: string) => {
      const nodeId = elementId as string
      recordEdit(elementId, prop, original, value)
      if (!demo && tabId) {
        if (prop === "lucideIcon") {
          const svgChildren = getIconSvgChildren(value)
          chrome.tabs.sendMessage(tabId, {
            type: "set-icon",
            nodeId,
            name: value,
            svgChildren,
          })
        } else {
          chrome.tabs.sendMessage(tabId, {
            type: "set-style",
            nodeId,
            prop,
            value,
          })
        }
      }
      recomputeChangeCount()
    },
    [demo, tabId],
  )

  const handleTextEdit = useCallback(
    (elementId: ElementId, original: string, value: string) => {
      const nodeId = elementId as string
      recordEdit(elementId, "textContent", original, value)
      if (!demo && tabId) {
        chrome.tabs.sendMessage(tabId, { type: "set-text", nodeId, value })
      }
      recomputeChangeCount()
    },
    [demo, tabId],
  )

  const handleUndo = useCallback(
    (elementId: ElementId, props: string[]) => {
      const nodeId = elementId as string
      const t = treeRef.current
      if (!t) return
      const node = findNode(t, nodeId)
      const path = node?.selectorPath
      if (!path) return
      const entry = editsRef.current.get(path)
      if (!entry) return
      for (const prop of props) {
        const edit = entry.props.get(prop)
        if (!edit) continue
        if (!demo && tabId) {
          if (prop === "textContent") {
            chrome.tabs.sendMessage(tabId, {
              type: "set-text",
              nodeId,
              value: edit.original,
            })
          } else if (prop === "lucideIcon") {
            const svgChildren = getIconSvgChildren(edit.original)
            chrome.tabs.sendMessage(tabId, {
              type: "set-icon",
              nodeId,
              name: edit.original,
              svgChildren,
            })
          } else {
            chrome.tabs.sendMessage(tabId, {
              type: "set-style",
              nodeId,
              prop,
              value: edit.original,
            })
          }
        }
        entry.props.delete(prop)
      }
      if (entry.props.size === 0) {
        editsRef.current.delete(path)
      }
      recomputeChangeCount()
    },
    [demo, tabId],
  )

  // Select an element and fetch its styles
  const handleSelect = useCallback(
    async (nodeId: string) => {
      if (selectedNodeId === nodeId) return
      setSelectedNodeId(nodeId)
      setSelectedStyles(null)
      if (!demo && tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: "highlight-element",
          nodeId,
        })
      }
      const reqId = ++styleRequestIdRef.current
      const result = demo
        ? DEMO_STYLES[nodeId] ?? null
        : await chrome.tabs.sendMessage(tabId!, {
            type: "get-styles",
            nodeId,
          })
      if (result && reqId === styleRequestIdRef.current) {
        if (demo) {
          setSelectedStyles(result as StyleData)
        } else {
          const { styles, selectorPath } = result as {
            styles: StyleData
            selectorPath: string
          }
          selectorPathCacheRef.current.set(nodeId, selectorPath)
          setSelectedStyles(styles)
        }
      }
    },
    [demo, tabId, selectedNodeId],
  )

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleMouseEnter = useCallback(
    (nodeId: string) => {
      if (!demo && tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: "highlight-element",
          nodeId,
        })
      }
    },
    [demo, tabId],
  )

  const handleMouseLeave = useCallback(() => {
    if (!demo && tabId) {
      if (selectedNodeId != null) {
        chrome.tabs.sendMessage(tabId, {
          type: "highlight-element",
          nodeId: selectedNodeId,
        })
      } else {
        chrome.tabs.sendMessage(tabId, { type: "clear-highlight" })
      }
    }
  }, [demo, tabId, selectedNodeId])

  // Poll discovery endpoint for available sessions (continuous)
  useEffect(() => {
    if (demo) return
    let cancelled = false

    async function fetchSessions() {
      try {
        const res = await fetch(DISCOVERY_URL)
        if (!cancelled && res.ok) {
          const data: SessionInfo[] = await res.json()
          setAvailableSessions(data)
        }
      } catch {
        if (!cancelled) setAvailableSessions([])
      }
    }

    fetchSessions()
    const timer = setInterval(fetchSessions, POLL_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [demo])

  // Auto-select session when exactly one is available
  useEffect(() => {
    if (demo) return
    if (availableSessions.length === 1) {
      setSelectedSession(availableSessions[0])
    } else if (availableSessions.length === 0) {
      setSelectedSession(null)
    } else {
      // Multiple sessions: clear selection if selected session disappeared
      setSelectedSession((current) => {
        if (!current) return null
        const stillExists = availableSessions.some((s) => s.id === current.id)
        return stillExists ? current : null
      })
    }
  }, [demo, availableSessions])

  // Connect Socket.IO to the selected session
  useEffect(() => {
    if (demo || !selectedSession) {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      callbackRef.current = null
      return
    }

    const socket = io(`http://localhost:${selectedSession.port}`, {
      auth: { sessionId: selectedSession.id },
    })
    socketRef.current = socket

    logEvent(AnalyticEvent.SessionActive, undefined, {
      repo: selectedSession.repo,
      sessionCount: String(availableSessions.length),
    })

    socket.on("collect_feedback", (data, callback) => {
      callbackRef.current = callback
      if (data?.agentName) setAgentName(data.agentName)
    })

    socket.on("disconnect", () => {
      callbackRef.current = null
      setAgentName(null)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      callbackRef.current = null
      setAgentName(null)
    }
  }, [demo, selectedSession?.id, selectedSession?.port])

  // Listen for element-tree, tab-refreshed, and spa-navigation messages
  useEffect(() => {
    if (demo) return
    async function onMessage(message: any) {
      if (message.type === "element-tree") {
        if (tabId != null && message.tabId !== tabId) return
        const newTree: TreeNode | null = message.tree
        const hadTree = treeRef.current != null
        treeRef.current = newTree
        setTree(newTree)
        setSelectionKey((k) => k + 1)

        if (newTree) {
          parentMapRef.current = buildParentMap(newTree)
          if (message.selectedPath) {
            const expanded = collectExpandedAtDepth(newTree, 1)
            for (const nid of message.selectedPath) expanded.add(nid)
            setExpandedNodes(expanded)
          } else if (!hadTree) {
            setExpandedNodes(collectExpandedAtDepth(newTree, 1))
          }
        } else {
          parentMapRef.current = new Map()
          setExpandedNodes(new Set())
        }

        if (message.selectedNodeId && newTree) {
          const nid = message.selectedNodeId
          setSelectedNodeId(nid)
          chrome.tabs.sendMessage(tabId!, {
            type: "highlight-element",
            nodeId: nid,
          })
          const reqId = ++styleRequestIdRef.current
          chrome.tabs
            .sendMessage(tabId!, { type: "get-styles", nodeId: nid })
            .then((result) => {
              if (result && reqId === styleRequestIdRef.current) {
                const { styles, selectorPath } = result as {
                  styles: StyleData
                  selectorPath: string
                }
                selectorPathCacheRef.current.set(nid, selectorPath)
                setSelectedStyles(styles)
              }
            })
        } else if (!newTree) {
          setSelectedNodeId(null)
          setSelectedStyles(null)
        }
      } else if (message.type === "tab-refreshed") {
        if (tabId != null && message.tabId !== tabId) return
        // Copy queued changes to clipboard before clearing
        let content = generateFeedbackDescription()
        if (content !== "No feedback given") {
          if (tabId != null) {
            try {
              const tab = await chrome.tabs.get(tabId)
              if (tab.url) {
                content = `The following feedback is in reference to ${tab.url}\n\n${content}`
              }
            } catch {}
          }
          copyToClipboard(content)
          let count = 0
          for (const [, entry] of editsRef.current) {
            for (const [, { original, current }] of entry.props) {
              if (original !== current) count++
            }
          }
          logEvent(AnalyticEvent.PageRefreshed, undefined, {
            unsavedChangeCount: String(count),
          })
          setToast(
            `Page refreshed — ${count} unsaved change${count === 1 ? "" : "s"} copied to clipboard`,
          )
          setTimeout(() => setToast(null), 4000)
        }
        // Clear all queued changes and reset UI state
        resetEdits()
        treeRef.current = null
        parentMapRef.current = new Map()
        selectorPathCacheRef.current = new Map()
        setTree(null)
        setSelectedNodeId(null)
        setSelectedStyles(null)
        setExpandedNodes(new Set())
        setSelectionMode(true)
        // Re-fetch page tokens and colors from the refreshed page
        chrome.tabs
          .sendMessage(tabId!, { type: "get-page-tokens" })
          .then((tokens) => {
            if (Array.isArray(tokens)) setPageTokens(tokens)
          })
          .catch(() => {})
        chrome.tabs
          .sendMessage(tabId!, { type: "get-page-colors" })
          .then((colors) => {
            if (Array.isArray(colors)) setPageColors(colors)
          })
          .catch(() => {})
      } else if (message.type === "spa-navigation") {
        // SPA navigation: clear stale element tree but keep selection mode
        treeRef.current = null
        parentMapRef.current = new Map()
        selectorPathCacheRef.current = new Map()
        setTree(null)
        setSelectedNodeId(null)
        setSelectedStyles(null)
        setExpandedNodes(new Set())
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [demo, tabId])

  const selectedItem =
    selectedNodeId != null && tree
      ? findNode(tree, selectedNodeId)
      : null

  const [activeTab, setActiveTab] = useState<"design" | "changes">("design")
  const [treeHeight, setTreeHeight] = useState(276)
  const dragRef = useRef<{
    startY: number
    startHeight: number
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const delta = e.clientY - dragRef.current.startY
      const newH = Math.max(
        80,
        Math.min(dragRef.current.startHeight + delta, 600),
      )
      setTreeHeight(newH)
    }
    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [])

  // Build changes grouped by component for the Changes tab
  function getChangesByComponent() {
    const groups = new Map<
      string,
      {
        componentPath: string | null
        elements: {
          selector: string
          selectorPath: string
          changes: { prop: string; from: string; to: string }[]
        }[]
      }
    >()
    for (const [selectorPath, entry] of editsRef.current) {
      const changedProps: { prop: string; from: string; to: string }[] = []
      for (const [prop, { original, current }] of entry.props) {
        if (original !== current) {
          changedProps.push({ prop, from: original, to: current })
        }
      }
      if (changedProps.length === 0) continue
      const key = entry.component || "(no component)"
      if (!groups.has(key))
        groups.set(key, {
          componentPath: entry.componentPath,
          elements: [],
        })
      const lastSegment = selectorPath.split(" > ").pop() || entry.selector
      groups
        .get(key)!
        .elements.push({
          selector: lastSegment,
          selectorPath,
          changes: changedProps,
        })
    }
    return groups
  }

  return (
    <div
      className={`relative flex flex-col h-full ${demo ? "w-96 mx-auto mt-8 border border-slate-300 dark:border-slate-700 rounded-3xl overflow-hidden max-h-[calc(100vh-64px)]" : ""}`}>
      {/* Tab bar */}
      <div
        className="shrink-0 bg-softgray dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
        style={{ padding: "8px 32px" }}>
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => {
              const next = !selectionMode
              setSelectionMode(next)
              logEvent(
                AnalyticEvent.SelectionModeToggled,
                next ? "on" : "off",
              )
            }}
            title={
              selectionMode
                ? "Turn off selection mode"
                : "Turn on selection mode to select an element from the page"
            }
            className={`shrink-0 flex items-center justify-center rounded-md p-1.5 transition-colors ${
              selectionMode
                ? "bg-electricblue-600 text-white"
                : "bg-slate-200 dark:bg-slate-700 text-black dark:text-white"
            }`}>
            <MousePointer2 size={14} />
          </button>
          <div
            className="flex flex-1 rounded-lg bg-slate-200 dark:bg-slate-700"
            style={{ padding: "2px" }}>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${
                activeTab === "design"
                  ? "text-xs font-bold bg-white text-electricblue-700 shadow-sm dark:bg-slate-600 dark:text-electricblue-300"
                  : "text-xs text-slate-600 dark:text-slate-300 dark:hover:text-white"
              }`}
              onClick={() => {
                setActiveTab("design")
                logEvent(AnalyticEvent.TabSwitched, "design")
              }}>
              <PencilLine size={12} />
              Design
            </button>
            <button
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 transition-colors ${
                activeTab === "changes"
                  ? "text-xs font-bold bg-white text-electricblue-700 shadow-sm dark:bg-slate-600 dark:text-electricblue-300"
                  : "text-xs text-slate-600 dark:text-slate-300 dark:hover:text-white"
              }`}
              onClick={() => {
                setActiveTab("changes")
                logEvent(AnalyticEvent.TabSwitched, "changes")
              }}>
              <Diff size={12} />
              Changes
              {changeCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-juicyorange-500 text-white text-[9px] font-bold leading-none min-w-[14px] h-[14px] px-0.5">
                  {changeCount}
                </span>
              )}
            </button>
          </div>
          <a
            href="https://github.com/tonkotsu-ai/handle/discussions/categories/general"
            target="_blank"
            rel="noreferrer"
            title="Share feedback on this extension"
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white transition-colors shrink-0">
            <MessageSquare size={14} />
          </a>
        </div>
      </div>

      {activeTab === "design" ? (
        <>
          {/* Tree panel */}
          <div
            className="shrink-0 overflow-y-auto"
            style={{ height: treeHeight }}>
            <div className="flex flex-col p-2">
              {!tree && (
                <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  Select an element on the page
                </div>
              )}
              {tree &&
                flattenVisibleTree(tree, expandedNodes).map(
                  ({ node, depth }) => (
                    <ElementRow
                      key={`${selectionKey}-${node.nodeId}`}
                      item={node}
                      elementId={node.nodeId}
                      depth={depth}
                      isLeaf={node.children.length === 0}
                      isExpanded={expandedNodes.has(node.nodeId)}
                      isEdited={hasEditsForElement(node.nodeId)}
                      isSelected={selectedNodeId === node.nodeId}
                      isHidden={node.hidden}
                      onSelect={(id) => handleSelect(id as string)}
                      onToggleExpand={(id) => handleToggleExpand(id as string)}
                      onMouseEnter={() => handleMouseEnter(node.nodeId)}
                      onMouseLeave={handleMouseLeave}
                    />
                  ),
                )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="shrink-0 flex items-center justify-center h-3 cursor-row-resize border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:bg-blue-200 dark:active:bg-blue-800/40 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault()
              dragRef.current = {
                startY: e.clientY,
                startHeight: treeHeight,
              }
              document.body.style.cursor = "row-resize"
              document.body.style.userSelect = "none"
            }}>
            <GripHorizontal
              size={10}
              className="text-slate-400 dark:text-slate-500"
            />
          </div>

          {/* Style editor panel */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selectedNodeId != null && selectedStyles ? (
              <div className="px-3">
                <StyleEditor
                  key={`${selectionKey}-${selectedNodeId}`}
                  styles={selectedStyles}
                  elementId={selectedNodeId}
                  editedProps={getEditedPropsForElement(selectedNodeId)}
                  lucideIconName={
                    selectedItem?.classes.includes(".lucide")
                      ? (selectedItem.classes.match(
                          /\.lucide-([a-z0-9-]+)/,
                        )?.[1] ?? null)
                      : null
                  }
                  isTextNode={selectedItem?.tag === "#text"}
                  pageTokens={pageTokens}
                  pageColors={pageColors}
                  onStyleEdit={handleStyleEdit}
                  onTextEdit={handleTextEdit}
                  onUndo={handleUndo}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400 dark:text-slate-500">
                {tree ? "Select an element to edit styles" : ""}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Changes tab */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {(() => {
            const groups = getChangesByComponent()
            if (groups.size === 0) {
              return (
                <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  No changes yet
                </div>
              )
            }
            return (
              <div className="flex flex-col gap-4 p-3">
                {Array.from(groups).map(([component, group]) => (
                  <div key={component} className="flex flex-col gap-2">
                    <div
                      className="text-xs font-bold dark:text-white"
                      title={group.componentPath || undefined}>
                      {component === "(no component)"
                        ? "Unowned Elements"
                        : component}
                    </div>
                    {group.elements.map((el, elIdx) => (
                      <div
                        key={elIdx}
                        className="flex flex-col gap-1 rounded-md bg-slate-100 dark:bg-slate-700 p-2 cursor-pointer hover:bg-electricblue-100 dark:hover:bg-electricblue-900/40 transition-colors"
                        onClick={() => {
                          setActiveTab("design")
                          if (!tabId) return
                          // Try to find the node in the current tree by selectorPath
                          function findBySelectorPath(
                            node: TreeNode,
                          ): string | null {
                            if (node.selectorPath === el.selectorPath)
                              return node.nodeId
                            for (const child of node.children) {
                              const found = findBySelectorPath(child)
                              if (found) return found
                            }
                            return null
                          }
                          const foundNodeId = tree
                            ? findBySelectorPath(tree)
                            : null
                          if (foundNodeId) {
                            setSelectedNodeId(foundNodeId)
                            setSelectedStyles(null)
                            chrome.tabs.sendMessage(tabId, {
                              type: "highlight-element",
                              nodeId: foundNodeId,
                            })
                            chrome.tabs
                              .sendMessage(tabId, {
                                type: "get-styles",
                                nodeId: foundNodeId,
                              })
                              .then((result) => {
                                if (result) {
                                  const { styles, selectorPath } = result as {
                                    styles: StyleData
                                    selectorPath: string
                                  }
                                  selectorPathCacheRef.current.set(
                                    foundNodeId,
                                    selectorPath,
                                  )
                                  setSelectedStyles(styles)
                                }
                              })
                          } else {
                            chrome.tabs.sendMessage(tabId, {
                              type: "select-by-selector",
                              selectorPath: el.selectorPath,
                            })
                          }
                        }}>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          {el.selector}
                        </div>
                        {el.changes.map((ch) => (
                          <div
                            key={ch.prop}
                            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-block h-2 w-2 rounded-full bg-juicyorange-500 shrink-0" />
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {ch.prop}
                            </span>
                            <span className="text-slate-400 dark:text-slate-500 line-through">
                              {ch.from}
                            </span>
                            <span>&rarr;</span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {ch.to}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      )}

      {/* Footer */}
      {!demo && (
        <SendBar
          sessions={availableSessions}
          selectedSession={selectedSession}
          onSelectSession={setSelectedSession}
          changeCount={changeCount}
          onSend={handleSend}
          onCancel={handleCancel}
          onCopy={handleCopy}
          agentName={agentName}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-16 left-3 right-3 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs px-3 py-2 shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}

export default SidePanel
