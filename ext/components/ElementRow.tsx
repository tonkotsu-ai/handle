import { Puzzle } from "lucide-react"
import { useEffect, useState } from "react"

import type { HierarchyItem, StyleData } from "~types"

import StyleEditor from "./StyleEditor"

interface ElementRowProps {
  item: HierarchyItem
  index: number
  isEdited: boolean
  editedProps: Map<string, { original: string; current: string }>
  tabId: number
  onStyleEdit: (index: number, prop: string, original: string, value: string) => void
  onTextEdit: (index: number, original: string, value: string) => void
  onUndo: (index: number, props: string[]) => void
  getStyles?: (index: number) => Promise<StyleData | null>
  defaultExpanded?: boolean
}

export default function ElementRow({
  item,
  index,
  isEdited,
  editedProps,
  tabId,
  onStyleEdit,
  onTextEdit,
  onUndo,
  getStyles,
  defaultExpanded
}: ElementRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [styles, setStyles] = useState<StyleData | null>(null)

  useEffect(() => {
    if (defaultExpanded) {
      const fetch = getStyles
        ? getStyles(index)
        : chrome.tabs.sendMessage(tabId, { type: "get-styles", index })
      fetch.then((result) => {
        if (result) {
          setStyles(result as StyleData)
          setExpanded(true)
        }
      })
    }
  }, [])

  async function handleClick() {
    if (expanded) {
      setExpanded(false)
      setStyles(null)
      return
    }
    const result = getStyles
      ? await getStyles(index)
      : await chrome.tabs.sendMessage(tabId, { type: "get-styles", index })
    if (result) {
      setStyles(result as StyleData)
      setExpanded(true)
    }
  }

  function handleMouseEnter() {
    if (!getStyles) chrome.tabs.sendMessage(tabId, { type: "highlight-element", index })
  }

  function handleMouseLeave() {
    if (!getStyles) chrome.tabs.sendMessage(tabId, { type: "clear-highlight" })
  }

  return (
    <div
      className={`rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden ${expanded ? "border border-slate-300 dark:border-slate-600" : "border border-slate-100 dark:border-slate-800"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>
      <div
        className={`flex flex-col gap-0.5 px-3 py-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 ${expanded ? "bg-slate-200 dark:bg-slate-700" : ""}`}
        onClick={handleClick}>
        {item.component && (
          <div className="flex items-center gap-1 text-base text-electricblue-600 dark:text-electricblue-400">
            {isEdited && <span className="h-2 w-2 rounded-full bg-juicyorange-500 shrink-0" />}
            <Puzzle size={15} />
            <span className="font-bold">{item.component}</span>
          </div>
        )}
        <div className="flex items-center gap-0.5 font-mono text-xs truncate">
          {isEdited && !item.component && <span className="mr-1 h-2 w-2 rounded-full bg-juicyorange-500 shrink-0" />}
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {item.tag}
          </span>
          {item.id && (
            <span className="text-lavendardream">{item.id}</span>
          )}
          {item.classes && (
            <span className="text-electricblue-500 dark:text-electricblue-400 truncate">
              {item.classes}
            </span>
          )}
        </div>
      </div>
      {expanded && styles && (
        <div className="px-3 pb-2 border-t border-slate-200 dark:border-slate-700">
          <StyleEditor
            styles={styles}
            index={index}
            editedProps={editedProps}
            lucideIconName={
              item.classes.includes(".lucide")
                ? item.classes.match(/\.lucide-([a-z0-9-]+)/)?.[1] ?? null
                : null
            }
            onStyleEdit={onStyleEdit}
            onTextEdit={onTextEdit}
            onUndo={onUndo}
          />
        </div>
      )}
    </div>
  )
}
