import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import "~style.css"

import type { EditEntry, HierarchyItem, SessionInfo, StyleData } from "~types"

import ElementRow from "./ElementRow"
import { getIconSvgChildren } from "./IconPicker"
import SendBar from "./SendBar"
import StyleEditor from "./StyleEditor"

const DISCOVERY_URL = "http://localhost:58932/api/sessions"
const POLL_INTERVAL = 3000

// Demo hierarchy is stored innermost-first (same order as content script),
// but rendered root-first via reversal in the tree panel.
const DEMO_HIERARCHY: HierarchyItem[] = [
  {
    tag: "h3",
    id: "",
    classes: ".text-lg.font-semibold",
    component: null
  },
  { tag: "div", id: "", classes: ".flex.flex-col.gap-2", component: null },
  {
    tag: "div",
    id: "",
    classes: ".card.p-6.rounded-xl.shadow-md",
    component: "ProfileCard"
  },
  {
    tag: "main",
    id: "",
    classes: ".flex.flex-col.items-center.gap-8",
    component: null
  },
  {
    tag: "div",
    id: "app",
    classes: ".min-h-screen.bg-gray-50",
    component: "App"
  },
  { tag: "body", id: "", classes: "", component: null }
]

const DEMO_STYLES: StyleData[] = [
  {
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
    textContent: "Jane Cooper"
  },
  {
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
    alignItems: "center"
  },
  {
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
    alignItems: "center"
  },
  {
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
    alignItems: "center"
  },
  {
    display: "block",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "#f9fafb",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none"
  },
  {
    display: "block",
    padding: "0px",
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    borderRadius: "0px",
    backgroundColor: "#ffffff",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none"
  }
]

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
  const [hierarchy, setHierarchy] = useState<HierarchyItem[]>(
    demo ? DEMO_HIERARCHY : []
  )
  const [tabId, setTabId] = useState<number | null>(() =>
    demo ? null : getTabIdFromLocation()
  )
  const [changeCount, setChangeCount] = useState(0)
  const [selectionKey, setSelectionKey] = useState(0)
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(
    null
  )
  const demoDefault = demo ? DEMO_HIERARCHY.length - 1 : null
  const [selectedIndex, setSelectedIndex] = useState<number | null>(demoDefault)
  const [selectedStyles, setSelectedStyles] = useState<StyleData | null>(
    demo ? DEMO_STYLES[DEMO_HIERARCHY.length - 1] : null
  )
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set())

  const editsRef = useRef<Map<number, EditEntry>>(new Map())
  const hierarchyRef = useRef<HierarchyItem[]>(demo ? DEMO_HIERARCHY : [])
  const socketRef = useRef<Socket | null>(null)
  const callbackRef = useRef<((response: { content: string }) => void) | null>(
    null
  )

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
          tabId
        })
      }
    },
    [demo, tabId]
  )

  // Enable design mode immediately when panel opens
  useEffect(() => {
    if (demo || tabId == null) return
    setDesignMode(true)
    return () => setDesignMode(false)
  }, [demo, tabId, setDesignMode])

  // Connect a port so background can detect panel closure
  useEffect(() => {
    if (demo || tabId == null) return
    const port = chrome.runtime.connect({ name: `sidepanel:${tabId}` })
    return () => port.disconnect()
  }, [demo, tabId])

  // Compute change count from edits — also bumps a revision to ensure re-render
  const [editRevision, setEditRevision] = useState(0)
  function recomputeChangeCount() {
    let count = 0
    for (const [, entry] of editsRef.current) {
      for (const [, { original, current }] of entry.props) {
        if (original !== current) count++
      }
    }
    setChangeCount(count)
    setEditRevision((r) => r + 1)
  }

  function hasEditsForElement(index: number) {
    const entry = editsRef.current.get(index)
    if (!entry) return false
    for (const [, { original, current }] of entry.props) {
      if (original !== current) return true
    }
    return false
  }

  function getEditedPropsForElement(
    index: number
  ): Map<string, { original: string; current: string }> {
    const entry = editsRef.current.get(index)
    if (!entry) return new Map()
    const result = new Map<string, { original: string; current: string }>()
    for (const [prop, { original, current }] of entry.props) {
      if (original !== current) result.set(prop, { original, current })
    }
    return result
  }

  function recordEdit(
    index: number,
    prop: string,
    originalValue: string,
    newValue: string
  ) {
    if (!editsRef.current.has(index)) {
      const item = hierarchyRef.current[index]
      const selector = item
        ? `${item.tag}${item.id}${item.classes}`
        : `element[${index}]`
      let component: string | null = null
      if (item?.component) {
        component = item.component
      } else {
        for (let i = index + 1; i < hierarchyRef.current.length; i++) {
          if (hierarchyRef.current[i]?.component) {
            component = hierarchyRef.current[i].component
            break
          }
        }
      }
      editsRef.current.set(index, {
        selector,
        component,
        props: new Map()
      })
    }
    const entry = editsRef.current.get(index)!
    if (!entry.props.has(prop)) {
      entry.props.set(prop, { original: originalValue, current: newValue })
    } else {
      entry.props.get(prop)!.current = newValue
    }
  }

  function generateFeedbackDescription() {
    const byComponent = new Map<
      string,
      {
        selector: string
        changes: { prop: string; from: string; to: string }[]
      }[]
    >()
    for (const [, entry] of editsRef.current) {
      const changedProps: { prop: string; from: string; to: string }[] = []
      for (const [prop, { original, current }] of entry.props) {
        if (original !== current) {
          changedProps.push({ prop, from: original, to: current })
        }
      }
      if (changedProps.length === 0) continue
      const key = entry.component || "(no component)"
      if (!byComponent.has(key)) byComponent.set(key, [])
      byComponent
        .get(key)!
        .push({ selector: entry.selector, changes: changedProps })
    }

    if (byComponent.size === 0) return "No feedback given"

    const lines: string[] = []
    for (const [component, elements] of byComponent) {
      lines.push(
        `In ${component === "(no component)" ? "unowned elements" : component}:`
      )
      for (const { selector, changes } of elements) {
        for (const { prop, from, to } of changes) {
          lines.push(
            `  - On ${selector}: change ${prop} from "${from}" to "${to}"`
          )
        }
      }
    }
    return lines.join("\n")
  }

  const handleCopy = useCallback(() => {
    const content = generateFeedbackDescription()
    navigator.clipboard.writeText(content)
  }, [])

  const handleSend = useCallback(() => {
    if (changeCount === 0 || !selectedSession) return

    const content = generateFeedbackDescription()

    if (callbackRef.current) {
      callbackRef.current({ content })
      callbackRef.current = null
    } else if (socketRef.current?.connected) {
      socketRef.current.emit("design_feedback", { content })
    }

    // Reset edits but keep design mode on and preserve hierarchy
    editsRef.current = new Map()
    setChangeCount(0)
    setEditRevision((r) => r + 1)
  }, [changeCount, selectedSession])

  const handleStyleEdit = useCallback(
    (index: number, prop: string, original: string, value: string) => {
      recordEdit(index, prop, original, value)
      if (!demo && tabId) {
        if (prop === "lucideIcon") {
          const svgChildren = getIconSvgChildren(value)
          chrome.tabs.sendMessage(tabId, {
            type: "set-icon",
            index,
            name: value,
            svgChildren
          })
        } else {
          chrome.tabs.sendMessage(tabId, {
            type: "set-style",
            index,
            prop,
            value
          })
        }
      }
      recomputeChangeCount()
    },
    [demo, tabId]
  )

  const handleTextEdit = useCallback(
    (index: number, original: string, value: string) => {
      recordEdit(index, "textContent", original, value)
      if (!demo && tabId) {
        chrome.tabs.sendMessage(tabId, { type: "set-text", index, value })
      }
      recomputeChangeCount()
    },
    [demo, tabId]
  )

  const handleUndo = useCallback(
    (index: number, props: string[]) => {
      const entry = editsRef.current.get(index)
      if (!entry) return
      for (const prop of props) {
        const edit = entry.props.get(prop)
        if (!edit) continue
        if (!demo && tabId) {
          if (prop === "textContent") {
            chrome.tabs.sendMessage(tabId, {
              type: "set-text",
              index,
              value: edit.original
            })
          } else if (prop === "lucideIcon") {
            const svgChildren = getIconSvgChildren(edit.original)
            chrome.tabs.sendMessage(tabId, {
              type: "set-icon",
              index,
              name: edit.original,
              svgChildren
            })
          } else {
            chrome.tabs.sendMessage(tabId, {
              type: "set-style",
              index,
              prop,
              value: edit.original
            })
          }
        }
        entry.props.delete(prop)
      }
      if (entry.props.size === 0) {
        editsRef.current.delete(index)
      }
      recomputeChangeCount()
    },
    [demo, tabId]
  )

  // Select an element and fetch its styles
  const handleSelect = useCallback(
    async (index: number) => {
      if (selectedIndex === index) return
      setSelectedIndex(index)
      setSelectedStyles(null)
      const result = demo
        ? DEMO_STYLES[index] ?? null
        : await chrome.tabs.sendMessage(tabId!, {
            type: "get-styles",
            index
          })
      if (result) {
        setSelectedStyles(result as StyleData)
      }
    },
    [demo, tabId, selectedIndex]
  )

  const handleToggleExpand = useCallback((index: number) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const handleMouseEnter = useCallback(
    (index: number) => {
      if (!demo && tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: "highlight-element",
          index
        })
      }
    },
    [demo, tabId]
  )

  const handleMouseLeave = useCallback(() => {
    if (!demo && tabId) {
      chrome.tabs.sendMessage(tabId, { type: "clear-highlight" })
    }
  }, [demo, tabId])

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
      auth: { sessionId: selectedSession.id }
    })
    socketRef.current = socket

    socket.on("collect_feedback", (_data, callback) => {
      callbackRef.current = callback
    })

    socket.on("disconnect", () => {
      callbackRef.current = null
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      callbackRef.current = null
    }
  }, [demo, selectedSession?.id, selectedSession?.port])

  // Listen for element-hierarchy messages from content script
  useEffect(() => {
    if (demo) return
    function onMessage(message: any) {
      if (message.type === "element-hierarchy") {
        if (tabId != null && message.tabId !== tabId) return
        const h: HierarchyItem[] = message.hierarchy
        hierarchyRef.current = h
        setHierarchy(h)
        setSelectionKey((k) => k + 1)
        setCollapsedNodes(new Set())
        // Auto-select the clicked element (index 0 = innermost) and fetch styles
        if (h.length > 0) {
          setSelectedIndex(0)
          chrome.tabs
            .sendMessage(tabId!, { type: "get-styles", index: 0 })
            .then((result) => {
              if (result) setSelectedStyles(result as StyleData)
            })
        } else {
          setSelectedIndex(null)
          setSelectedStyles(null)
        }
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [demo, tabId])

  const selectedItem =
    selectedIndex != null ? hierarchy[selectedIndex] : null

  return (
    <div
      className={`flex flex-col h-full ${demo ? "w-96 mx-auto mt-8 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden" : ""}`}>
      {/* Tree panel */}
      <div
        className="shrink-0 overflow-y-auto border-b border-slate-200 dark:border-slate-700"
        style={{ height: 276 }}>
        <div className="flex flex-col p-2">
          {hierarchy.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Select an element on the page
            </div>
          )}
          {/* Hierarchy is innermost-first; render reversed so root is at top */}
          {(() => {
            const reversed = [...hierarchy].reverse()
            const rows: React.ReactNode[] = []
            let hiddenBelowDepth: number | null = null
            for (let displayIdx = 0; displayIdx < reversed.length; displayIdx++) {
              const item = reversed[displayIdx]
              const index = hierarchy.length - 1 - displayIdx
              const depth = displayIdx
              const isLeaf = displayIdx === reversed.length - 1

              // Skip nodes hidden by a collapsed ancestor
              if (hiddenBelowDepth != null && depth > hiddenBelowDepth) continue
              hiddenBelowDepth = null

              const isExpanded = !collapsedNodes.has(index)
              if (!isExpanded) hiddenBelowDepth = depth

              rows.push(
                <ElementRow
                  key={`${selectionKey}-${index}`}
                  item={item}
                  index={index}
                  depth={depth}
                  isLeaf={isLeaf}
                  isExpanded={isExpanded}
                  isEdited={hasEditsForElement(index)}
                  isSelected={selectedIndex === index}
                  onSelect={handleSelect}
                  onToggleExpand={handleToggleExpand}
                  onMouseEnter={() => handleMouseEnter(index)}
                  onMouseLeave={handleMouseLeave}
                />
              )
            }
            return rows
          })()}
        </div>
      </div>

      {/* Style editor panel */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedIndex != null && selectedStyles ? (
          <div className="px-3">
            <StyleEditor
              key={`${selectionKey}-${selectedIndex}`}
              styles={selectedStyles}
              index={selectedIndex}
              editedProps={getEditedPropsForElement(selectedIndex)}
              lucideIconName={
                selectedItem?.classes.includes(".lucide")
                  ? (selectedItem.classes.match(
                      /\.lucide-([a-z0-9-]+)/
                    )?.[1] ?? null)
                  : null
              }
              tabId={tabId}
              onStyleEdit={handleStyleEdit}
              onTextEdit={handleTextEdit}
              onUndo={handleUndo}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-slate-400 dark:text-slate-500">
            {hierarchy.length > 0
              ? "Select an element to edit styles"
              : ""}
          </div>
        )}
      </div>

      {/* Footer */}
      {!demo && (
        <SendBar
          sessions={availableSessions}
          selectedSession={selectedSession}
          onSelectSession={setSelectedSession}
          changeCount={changeCount}
          onSend={handleSend}
          onCopy={handleCopy}
        />
      )}
    </div>
  )
}

export default SidePanel
