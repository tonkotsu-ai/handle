import { useEffect, useRef } from "react"
import { ChevronRight, Puzzle } from "lucide-react"

import type { ElementId, ElementItem } from "../types"

export interface ElementRowProps {
  item: ElementItem
  elementId: ElementId
  depth: number
  isLeaf: boolean
  isExpanded: boolean
  isEdited: boolean
  isSelected: boolean
  onSelect: (elementId: ElementId) => void
  onToggleExpand: (elementId: ElementId) => void
  isHidden?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ElementRow({
  item,
  elementId,
  depth,
  isLeaf,
  isExpanded,
  isEdited,
  isSelected,
  isHidden,
  onSelect,
  onToggleExpand,
  onMouseEnter,
  onMouseLeave
}: ElementRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [isSelected])

  return (
    <div
      ref={rowRef}
      className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded ${
        isSelected
          ? "bg-electricblue-100 dark:bg-electricblue-900/40"
          : "hover:bg-slate-100 dark:hover:bg-slate-800"
      } ${isHidden ? "opacity-50" : ""}`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelect(elementId)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}>
      {isLeaf ? (
        <span className="w-3 shrink-0" />
      ) : (
        <button
          className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(elementId)
          }}>
          <ChevronRight
            size={12}
            className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        </button>
      )}
      {isEdited && (
        <span className="h-2 w-2 rounded-full bg-juicyorange-500 shrink-0" />
      )}
      {item.component && (
        <Puzzle
          size={13}
          className="shrink-0 text-electricblue-500 dark:text-electricblue-400"
        />
      )}
      <div className="flex items-center gap-0.5 font-sans text-xs truncate min-w-0">
        {item.tag === "#text" ? (
          <span className="italic text-slate-500 dark:text-slate-400 truncate">
            &quot;{item.textContent && item.textContent.length > 40
              ? item.textContent.slice(0, 40) + "…"
              : item.textContent}&quot;
          </span>
        ) : item.component ? (
          <span className="font-bold text-electricblue-500 dark:text-electricblue-400 truncate">
            {item.component}
          </span>
        ) : (
          <>
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
          </>
        )}
        {!isLeaf && !isExpanded && item.childCount != null && item.childCount > 0 && (
          <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-0.5">
            ({item.childCount})
          </span>
        )}
      </div>
    </div>
  )
}
