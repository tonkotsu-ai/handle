import { ChevronRight, Puzzle } from "lucide-react"

import type { HierarchyItem } from "~types"

interface ElementRowProps {
  item: HierarchyItem
  index: number
  depth: number
  isLeaf: boolean
  isExpanded: boolean
  isEdited: boolean
  isSelected: boolean
  onSelect: (index: number) => void
  onToggleExpand: (index: number) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ElementRow({
  item,
  index,
  depth,
  isLeaf,
  isExpanded,
  isEdited,
  isSelected,
  onSelect,
  onToggleExpand,
  onMouseEnter,
  onMouseLeave
}: ElementRowProps) {
  return (
    <div
      className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded ${
        isSelected
          ? "bg-electricblue-100 dark:bg-electricblue-900/40"
          : "hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      onClick={() => onSelect(index)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}>
      {isLeaf ? (
        <span className="w-3 shrink-0" />
      ) : (
        <button
          className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(index)
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
          className="shrink-0 text-electricblue-600 dark:text-electricblue-400"
        />
      )}
      <div className="flex items-center gap-0.5 font-mono text-xs truncate min-w-0">
        {item.component ? (
          <span className="font-bold text-electricblue-600 dark:text-electricblue-400 truncate">
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
      </div>
    </div>
  )
}
