import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import "~style.css"

import type { EditEntry, HierarchyItem, SessionInfo, StyleData } from "~types"

import ElementRow from "./ElementRow"
import { getIconSvgChildren } from "./IconPicker"
import SendBar from "./SendBar"

const DISCOVERY_URL = "http://localhost:58932/api/sessions"
const POLL_INTERVAL = 3000

const DEMO_HIERARCHY: HierarchyItem[] = [
  { tag: "div", id: "", classes: ".card.p-6.rounded-xl.shadow-md", component: "ProfileCard" },
  { tag: "img", id: "", classes: ".avatar.w-16.h-16.rounded-full", component: null },
  { tag: "div", id: "", classes: ".flex.flex-col.gap-2", component: null },
  { tag: "h3", id: "", classes: ".text-lg.font-semibold", component: null },
  { tag: "p", id: "", classes: ".text-sm.text-gray-500", component: null }
]

const DEMO_STYLES: StyleData[] = [
  { display: "flex", flexDirection: "column", gap: "16px", padding: "24px", fontFamily: "Inter", fontWeight: "400", fontSize: "16px", borderRadius: "12px", backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: "1px", borderStyle: "solid", alignItems: "center" },
  { display: "block", padding: "0px", fontFamily: "Inter", fontWeight: "400", fontSize: "16px", borderRadius: "9999px", backgroundColor: "#e2e8f0", borderColor: "transparent", borderWidth: "0px", borderStyle: "none" },
  { display: "flex", flexDirection: "column", gap: "4px", padding: "0px", fontFamily: "Inter", fontWeight: "400", fontSize: "16px", borderRadius: "0px", backgroundColor: "transparent", borderColor: "transparent", borderWidth: "0px", borderStyle: "none", alignItems: "center" },
  { display: "block", padding: "0px", fontFamily: "Inter", fontWeight: "600", fontSize: "18px", borderRadius: "0px", backgroundColor: "transparent", borderColor: "transparent", borderWidth: "0px", borderStyle: "none", textContent: "Jane Cooper" },
  { display: "block", padding: "0px", fontFamily: "Inter", fontWeight: "400", fontSize: "14px", borderRadius: "0px", backgroundColor: "transparent", borderColor: "transparent", borderWidth: "0px", borderStyle: "none", textContent: "Product Designer at Acme Co." }
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
  const [hierarchy, setHierarchy] = useState<HierarchyItem[]>(demo ? DEMO_HIERARCHY : [])
  const [tabId, setTabId] = useState<number | null>(() =>
    demo ? null : getTabIdFromLocation()
  )
  const [changeCount, setChangeCount] = useState(0)
  const [selectionKey, setSelectionKey] = useState(0)
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)

  const editsRef = useRef<Map<number, EditEntry>>(new Map())
  const hierarchyRef = useRef<HierarchyItem[]>(demo ? DEMO_HIERARCHY : [])
  const socketRef = useRef<Socket | null>(null)
  const callbackRef = useRef<((response: { content: string }) => void) | null>(null)

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

  function getEditedPropsForElement(index: number): Map<string, { original: string; current: string }> {
    const entry = editsRef.current.get(index)
    if (!entry) return new Map()
    const result = new Map<string, { original: string; current: string }>()
    for (const [prop, { original, current }] of entry.props) {
      if (original !== current) result.set(prop, { original, current })
    }
    return result
  }

  function recordEdit(index: number, prop: string, originalValue: string, newValue: string) {
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
      editsRef.current.set(index, { selector, component, props: new Map() })
    }
    const entry = editsRef.current.get(index)!
    if (!entry.props.has(prop)) {
      entry.props.set(prop, { original: originalValue, current: newValue })
    } else {
      entry.props.get(prop)!.current = newValue
    }
  }

  function generateFeedbackDescription() {
    const byComponent = new Map<string, { selector: string; changes: { prop: string; from: string; to: string }[] }[]>()
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
      byComponent.get(key)!.push({ selector: entry.selector, changes: changedProps })
    }

    if (byComponent.size === 0) return "No feedback given"

    const lines: string[] = []
    for (const [component, elements] of byComponent) {
      lines.push(
        `In ${component === "(no component)" ? "unowned elements" : component}:`
      )
      for (const { selector, changes } of elements) {
        for (const { prop, from, to } of changes) {
          lines.push(`  - On ${selector}: change ${prop} from "${from}" to "${to}"`)
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
          chrome.tabs.sendMessage(tabId, { type: "set-icon", index, name: value, svgChildren })
        } else {
          chrome.tabs.sendMessage(tabId, { type: "set-style", index, prop, value })
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
            chrome.tabs.sendMessage(tabId, { type: "set-text", index, value: edit.original })
          } else if (prop === "lucideIcon") {
            const svgChildren = getIconSvgChildren(edit.original)
            chrome.tabs.sendMessage(tabId, { type: "set-icon", index, name: edit.original, svgChildren })
          } else {
            chrome.tabs.sendMessage(tabId, { type: "set-style", index, prop, value: edit.original })
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
        hierarchyRef.current = message.hierarchy
        setHierarchy(message.hierarchy)
        setSelectionKey((k) => k + 1)
      }
    }
    chrome.runtime.onMessage.addListener(onMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage)
    }
  }, [demo, tabId])

  const demoGetStyles = useCallback(
    async (i: number) => DEMO_STYLES[i] ?? null,
    []
  )

  return (
    <div
      className={`flex flex-col h-full ${demo ? "w-96 mx-auto mt-8 p-2 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden" : ""}`}>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {hierarchy.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Select an element on the page
            </div>
          )}
          {hierarchy.map((item, index) => (
            <ElementRow
              key={`${selectionKey}-${index}`}
              item={item}
              index={index}
              isEdited={hasEditsForElement(index)}
              editedProps={getEditedPropsForElement(index)}
              tabId={tabId!}
              onStyleEdit={handleStyleEdit}
              onTextEdit={handleTextEdit}
              onUndo={handleUndo}
              getStyles={demo ? demoGetStyles : undefined}
              defaultExpanded={demo && index === 0}
            />
          ))}
        </div>
      </div>

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
