import {
  AlignCenter,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceAround,
  Dot,
  GripHorizontal,
  GripVertical,
  LayoutGrid,
  StretchHorizontal,
  StretchVertical,
  SquareRoundCorner,
  Undo2
} from "lucide-react"
import { useState } from "react"

import type { StyleData } from "~types"

import ColorPicker from "./ColorPicker"
import IconPicker from "./IconPicker"

interface StyleEditorProps {
  styles: StyleData
  index: number
  editedProps: Map<string, { original: string; current: string }>
  lucideIconName?: string | null
  tabId: number | null
  pageTokens?: Array<{ name: string; value: string }>
  onStyleEdit: (index: number, prop: string, original: string, value: string) => void
  onTextEdit: (index: number, original: string, value: string) => void
  onUndo: (index: number, props: string[]) => void
}

function EditDot() {
  return <span className="inline-block h-2 w-2 rounded-full bg-juicyorange-500 shrink-0" />
}

function FieldLabel({ children, edited, onUndo }: { children: React.ReactNode; edited?: boolean; onUndo?: () => void }) {
  return (
    <div className="flex items-center gap-1 text-xs text-slate-900 dark:text-slate-400">
      {edited && <EditDot />}
      {children}
      {edited && onUndo && (
        <button
          className="pl-0.5 text-slate-400 hover:text-juicyorange-500 dark:text-slate-500 dark:hover:text-juicyorange-400"
          title="Undo"
          onClick={onUndo}>
          <Undo2 size={11} />
        </button>
      )}
    </div>
  )
}

function FieldInput({
  value,
  onChange
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [current, setCurrent] = useState(value)

  return (
    <input
      type="text"
      className="w-full rounded border-0 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs outline-none focus:border-electricblue-500"
      value={current}
      onChange={(e) => setCurrent(e.target.value)}
      onBlur={() => {
        if (current !== value) onChange(current)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function NumericInput({
  value,
  icon,
  onChange
}: {
  value: string | number
  icon?: React.ReactNode
  onChange: (val: string) => void
}) {
  const strVal = String(value)
  const [current, setCurrent] = useState(strVal)

  const input = (
    <input
      type="text"
      className={`${icon ? "w-full bg-transparent outline-none text-xs text-center" : "w-16 rounded border-0 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-center outline-none focus:border-electricblue-500"}`}
      value={current}
      onChange={(e) => setCurrent(e.target.value)}
      onBlur={() => {
        if (current !== strVal) onChange(current)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
    />
  )

  if (icon) {
    return (
      <div className="flex items-center gap-1 w-16 rounded border-0 bg-slate-100 dark:bg-slate-800 px-2 py-1 focus-within:border-electricblue-500">
        <span className="shrink-0 text-slate-400">{icon}</span>
        {input}
      </div>
    )
  }

  return input
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-bold dark:text-white tracking-wide" style={{ fontSize: "15px" }}>
      {children}
    </div>
  )
}

function FlowControls({
  styles,
  index,
  flowMode,
  edited,
  onFlowChange,
  onStyleEdit,
  onUndo
}: {
  styles: StyleData
  index: number
  flowMode: string | null
  edited: boolean
  onFlowChange: (mode: string | null) => void
  onStyleEdit: StyleEditorProps["onStyleEdit"]
  onUndo?: () => void
}) {
  const flows = [
    { mode: "column", icon: <StretchVertical size={14} />, title: "Vertical" },
    { mode: "row", icon: <StretchHorizontal size={14} />, title: "Horizontal" },
    { mode: "grid", icon: <LayoutGrid size={14} />, title: "Grid" }
  ]

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel edited={edited} onUndo={onUndo}>Flow</FieldLabel>
      <div className="flex w-full rounded-lg bg-slate-100 dark:bg-slate-700" style={{ padding: "2px" }}>
        {flows.map((f) => (
          <button
            key={f.mode}
            title={f.title}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-colors ${
              flowMode === f.mode
                ? "bg-white text-electricblue-700 shadow-sm dark:bg-slate-600 dark:text-electricblue-300"
                : "text-slate-600 dark:text-slate-300 dark:hover:text-white"
            }`}
            onClick={() => {
              const display = styles.display || "block"
              if (flowMode === f.mode) {
                onStyleEdit(index, "display", display, "block")
                onStyleEdit(index, "flexDirection", styles.flexDirection || "", "")
                onFlowChange(null)
              } else if (f.mode === "grid") {
                onStyleEdit(index, "display", display, "grid")
                onFlowChange("grid")
              } else {
                onStyleEdit(index, "display", display, "flex")
                onStyleEdit(index, "flexDirection", styles.flexDirection || "", f.mode)
                onFlowChange(f.mode)
              }
            }}>
            {f.icon}
            {f.title}
          </button>
        ))}
      </div>
    </div>
  )
}

function AlignmentGrid({
  styles,
  index,
  flowMode,
  edited,
  onFlowChange,
  onStyleEdit,
  onUndo
}: {
  styles: StyleData
  index: number
  flowMode: string | null
  edited: boolean
  onFlowChange: (mode: string) => void
  onStyleEdit: StyleEditorProps["onStyleEdit"]
  onUndo?: () => void
}) {
  const alignValues = ["flex-start", "center", "flex-end"]

  function normalize(v: string) {
    if (
      v === "start" ||
      v === "flex-start" ||
      v === "normal" ||
      v === "stretch"
    )
      return 0
    if (v === "center") return 1
    if (v === "end" || v === "flex-end") return 2
    return 0
  }

  function getActivePos() {
    if (!flowMode) return { col: -1, row: -1 }
    const ai = styles.alignItems || "stretch"
    const isFlex =
      styles.display === "flex" || styles.display === "inline-flex"
    const jc = isFlex
      ? styles.justifyContent || "flex-start"
      : styles.justifyItems || "start"
    let hVal: string, vVal: string
    if (flowMode === "row") {
      hVal = jc
      vVal = ai
    } else if (flowMode === "column") {
      hVal = ai
      vVal = jc
    } else {
      hVal = styles.justifyItems || "start"
      vVal = ai
    }
    return { col: normalize(hVal), row: normalize(vVal) }
  }

  const [activePos, setActivePos] = useState(getActivePos)
  const [hoveredCell, setHoveredCell] = useState<{
    row: number
    col: number
  } | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel edited={edited} onUndo={onUndo}>Alignment</FieldLabel>
      <div className="grid grid-cols-3 gap-px rounded bg-slate-100 overflow-hidden w-full p-0.5">
        {Array.from({ length: 9 }).map((_, i) => {
          const r = Math.floor(i / 3)
          const c = i % 3
          const isActive = activePos.row === r && activePos.col === c
          const isHovered =
            hoveredCell?.row === r && hoveredCell?.col === c
          const colIcons = [
            <AlignLeft key="l" size={12} />,
            <AlignCenter key="c" size={12} />,
            <AlignRight key="r" size={12} />
          ]

          return (
            <button
              key={i}
              className={`h-6 w-6 flex items-center justify-center w-full ${
                isActive
                  ? "bg-electricblue-200 text-electricblue-700 dark:bg-electricblue-800 dark:text-electricblue-300 rounded"
                  : "dark:bg-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
              onMouseEnter={() => setHoveredCell({ row: r, col: c })}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => {
                let mode = flowMode
                if (!mode) {
                  const display = styles.display || "block"
                  onStyleEdit(index, "display", display, "flex")
                  onStyleEdit(
                    index,
                    "flexDirection",
                    styles.flexDirection || "",
                    "row"
                  )
                  mode = "row"
                  onFlowChange("row")
                }
                const hProp =
                  mode === "row"
                    ? "justifyContent"
                    : mode === "column"
                      ? "alignItems"
                      : "justifyItems"
                const vProp =
                  mode === "row"
                    ? "alignItems"
                    : mode === "column"
                      ? "justifyContent"
                      : "alignItems"
                onStyleEdit(
                  index,
                  hProp,
                  styles[hProp] || "",
                  alignValues[c]
                )
                onStyleEdit(
                  index,
                  vProp,
                  styles[vProp] || "",
                  alignValues[r]
                )
                setActivePos({ col: c, row: r })
              }}>
              {isActive || isHovered ? colIcons[c] : <Dot size={12} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function hasAny(editedProps: Map<string, any>, ...keys: string[]) {
  return keys.some((k) => editedProps.has(k))
}

function effective(editedProps: Map<string, { original: string; current: string }>, prop: string, fallback: string): string {
  return editedProps.get(prop)?.current ?? fallback
}

export default function StyleEditor({
  styles,
  index,
  editedProps,
  lucideIconName,
  tabId,
  pageTokens,
  onStyleEdit,
  onTextEdit,
  onUndo
}: StyleEditorProps) {
  const display = styles.display || "block"
  const isFlex = display === "flex" || display === "inline-flex"
  const isGrid = display === "grid" || display === "inline-grid"

  const initialFlowMode = isFlex
    ? styles.flexDirection === "column"
      ? "column"
      : "row"
    : isGrid
      ? "grid"
      : null

  const [flowMode, setFlowMode] = useState<string | null>(initialFlowMode)

  const padParts = (styles.padding || "0px").split(/\s+/)
  const padTop = parseInt(padParts[0]) || 0
  const padRight = parseInt(padParts[1] ?? padParts[0]) || 0
  const padBottom = parseInt(padParts[2] ?? padParts[0]) || 0
  const padLeft = parseInt(padParts[3] ?? padParts[1] ?? padParts[0]) || 0

  return (
    <div className="flex flex-col gap-4 py-3">
      {/* Layout */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Layout</SectionLabel>
        <FlowControls
          styles={styles}
          index={index}
          flowMode={flowMode}
          edited={hasAny(editedProps, "display", "flexDirection")}
          onFlowChange={setFlowMode}
          onStyleEdit={onStyleEdit}
          onUndo={() => {
            onUndo(index, ["display", "flexDirection"])
            setFlowMode(initialFlowMode)
          }}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <AlignmentGrid
            key={`${effective(editedProps, "justifyContent", "")}-${effective(editedProps, "alignItems", "")}-${effective(editedProps, "justifyItems", "")}`}
            styles={styles}
            index={index}
            flowMode={flowMode}
            edited={hasAny(editedProps, "justifyContent", "alignItems", "justifyItems")}
            onFlowChange={setFlowMode}
            onStyleEdit={onStyleEdit}
            onUndo={() => onUndo(index, ["justifyContent", "alignItems", "justifyItems"])}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("gap")} onUndo={() => onUndo(index, ["gap"])}>Gap</FieldLabel>
            <div>
              <NumericInput
                key={effective(editedProps, "gap", styles.gap || "")}
                icon={flowMode === "column" ? <GripHorizontal size={14} /> : <GripVertical size={14} />}
                value={(isFlex || isGrid) ? (parseInt(effective(editedProps, "gap", styles.gap || "")) || 0) : ""}
                onChange={(val) => {
                  const v = val.match(/\d/) ? val : "0"
                  const gapVal = v.match(/[a-z%]/) ? v : v + "px"
                  onStyleEdit(index, "gap", styles.gap || "", gapVal)
                }}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={hasAny(editedProps, "paddingLeft", "paddingRight", "paddingTop", "paddingBottom")} onUndo={() => onUndo(index, ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"])}>Padding</FieldLabel>
            <div>
              <NumericInput
                key={effective(editedProps, "paddingLeft", padLeft + "px")}
                icon={<AlignHorizontalSpaceAround size={14} />}
                value={parseInt(effective(editedProps, "paddingLeft", padLeft + "px")) || 0}
                onChange={(val) => {
                  const v = (parseInt(val) || 0) + "px"
                  onStyleEdit(index, "paddingLeft", padLeft + "px", v)
                  onStyleEdit(index, "paddingRight", padRight + "px", v)
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs">&nbsp;</div>
            <div>
              <NumericInput
                key={effective(editedProps, "paddingTop", padTop + "px")}
                icon={<AlignVerticalSpaceAround size={14} />}
                value={parseInt(effective(editedProps, "paddingTop", padTop + "px")) || 0}
                onChange={(val) => {
                  const v = (parseInt(val) || 0) + "px"
                  onStyleEdit(index, "paddingTop", padTop + "px", v)
                  onStyleEdit(index, "paddingBottom", padBottom + "px", v)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Appearance */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Appearance</SectionLabel>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("opacity")} onUndo={() => onUndo(index, ["opacity"])}>Opacity</FieldLabel>
            <FieldInput
              key={effective(editedProps, "opacity", styles.opacity || "1")}
              value={effective(editedProps, "opacity", styles.opacity || "1")}
              onChange={(val) =>
                onStyleEdit(index, "opacity", styles.opacity || "1", val)
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderRadius")} onUndo={() => onUndo(index, ["borderRadius"])}>Corner Radius</FieldLabel>
            <div>
              <NumericInput
                key={effective(editedProps, "borderRadius", styles.borderRadius || "0px")}
                icon={<SquareRoundCorner size={14} />}
                value={parseInt(effective(editedProps, "borderRadius", styles.borderRadius || "0px")) || 0}
                onChange={(val) => {
                  const v = val.match(/[a-z%]/) ? val : val + "px"
                  onStyleEdit(index, "borderRadius", styles.borderRadius || "0px", v)
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Fill */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Fill</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={editedProps.has("backgroundColor")} onUndo={() => onUndo(index, ["backgroundColor"])}>Color</FieldLabel>
          <ColorPicker
            value={effective(editedProps, "backgroundColor", styles.backgroundColor || "transparent")}
            tabId={tabId}
            tokens={pageTokens}
            onChange={(val) =>
              onStyleEdit(
                index,
                "backgroundColor",
                styles.backgroundColor || "transparent",
                val
              )
            }
          />
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Stroke */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Stroke</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={editedProps.has("borderColor")} onUndo={() => onUndo(index, ["borderColor"])}>Color</FieldLabel>
          <ColorPicker
            value={effective(editedProps, "borderColor", styles.borderColor || "none")}
            tabId={tabId}
            tokens={pageTokens}
            onChange={(val) =>
              onStyleEdit(
                index,
                "borderColor",
                styles.borderColor || "none",
                val
              )
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderStyle")} onUndo={() => onUndo(index, ["borderStyle"])}>Position</FieldLabel>
            <div className="flex w-full rounded-lg bg-slate-100 dark:bg-slate-700" style={{ padding: "2px" }}>
              {[
                { value: "inside", label: "Inside" },
                { value: "outside", label: "Outside" }
              ].map((opt) => {
                const currentOutline = effective(editedProps, "borderStyle", styles.borderStyle || "none")
                const isOutside = currentOutline === "outline"
                const isActive = opt.value === "outside" ? isOutside : !isOutside && currentOutline !== "none"
                return (
                  <button
                    key={opt.value}
                    className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-white text-electricblue-700 shadow-sm dark:bg-slate-600 dark:text-electricblue-300"
                        : "text-slate-600 dark:text-slate-300 dark:hover:text-white"
                    }`}
                    onClick={() => {
                      if (opt.value === "outside") {
                        onStyleEdit(index, "borderStyle", styles.borderStyle || "none", "outline")
                      } else {
                        onStyleEdit(index, "borderStyle", styles.borderStyle || "none", "solid")
                      }
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderWidth")} onUndo={() => onUndo(index, ["borderWidth"])}>Weight</FieldLabel>
            <NumericInput
              key={effective(editedProps, "borderWidth", styles.borderWidth || "0px")}
              value={parseInt(effective(editedProps, "borderWidth", styles.borderWidth || "0px")) || 0}
              onChange={(val) => {
                const v = val.match(/[a-z%]/) ? val : val + "px"
                onStyleEdit(index, "borderWidth", styles.borderWidth || "0px", v)
              }}
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Typography */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Typography</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={editedProps.has("fontFamily")} onUndo={() => onUndo(index, ["fontFamily"])}>Font</FieldLabel>
          <FieldInput
            key={effective(editedProps, "fontFamily", styles.fontFamily || "")}
            value={effective(editedProps, "fontFamily", styles.fontFamily || "")}
            onChange={(newVal) =>
              onStyleEdit(index, "fontFamily", styles.fontFamily || "", newVal)
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel
            edited={editedProps.has("color")}
            onUndo={() => onUndo(index, ["color"])}
          >
            Color
          </FieldLabel>
          <ColorPicker
            value={effective(editedProps, "color", styles.color || "transparent")}
            tabId={tabId}
            tokens={pageTokens}
            onChange={(val) =>
              onStyleEdit(index, "color", styles.color || "transparent", val)
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("fontWeight")} onUndo={() => onUndo(index, ["fontWeight"])}>Weight</FieldLabel>
            <FieldInput
              key={effective(editedProps, "fontWeight", styles.fontWeight || "")}
              value={effective(editedProps, "fontWeight", styles.fontWeight || "")}
              onChange={(newVal) =>
                onStyleEdit(index, "fontWeight", styles.fontWeight || "", newVal)
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("fontSize")} onUndo={() => onUndo(index, ["fontSize"])}>Size</FieldLabel>
            <FieldInput
              key={effective(editedProps, "fontSize", styles.fontSize || "")}
              value={effective(editedProps, "fontSize", styles.fontSize || "")}
              onChange={(newVal) =>
                onStyleEdit(index, "fontSize", styles.fontSize || "", newVal)
              }
            />
          </div>
        </div>
      </div>

      {(styles.textContent != null || lucideIconName) && (
        <>
          <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

          {/* Content */}
          <div className="flex flex-col gap-2">
            <SectionLabel>Content</SectionLabel>
            {styles.textContent != null && (
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("textContent")} onUndo={() => onUndo(index, ["textContent"])}>Text</FieldLabel>
                <FieldInput
                  key={effective(editedProps, "textContent", styles.textContent!)}
                  value={effective(editedProps, "textContent", styles.textContent!)}
                  onChange={(val) => onTextEdit(index, styles.textContent!, val)}
                />
              </div>
            )}
            {lucideIconName && (
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("lucideIcon")} onUndo={() => onUndo(index, ["lucideIcon"])}>Icon</FieldLabel>
                <IconPicker
                  currentIcon={effective(editedProps, "lucideIcon", lucideIconName)}
                  onSelect={(name) => onStyleEdit(index, "lucideIcon", lucideIconName, name)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
