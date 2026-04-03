import {
  AlignCenter,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignVerticalSpaceAround,
  AlignVerticalSpaceBetween,
  ArrowDownFromLine,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  ArrowUpFromLine,
  Blend,
  Columns,
  Dot,
  LayoutGrid,
  Rows,
  Scan,
  Undo2
} from "lucide-react"
import { useMemo, useRef, useState } from "react"

import type { ElementId, StyleData, TokenEntry } from "../types"

import ColorPicker from "./ColorPicker"
import IconPicker from "./IconPicker"

export interface StyleEditorProps {
  styles: StyleData
  elementId: ElementId
  editedProps: Map<string, { original: string; current: string; tokenName?: string }>
  lucideIconName?: string | null
  pageTokens?: TokenEntry[]
  pageColors?: string[]
  isTextNode?: boolean
  onStyleEdit: (elementId: ElementId, prop: string, original: string, value: string, tokenName?: string) => void
  onTextEdit: (elementId: ElementId, original: string, value: string) => void
  onUndo: (elementId: ElementId, props: string[]) => void
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
  edited,
  onChange
}: {
  value: string
  edited?: boolean
  onChange: (val: string) => void
}) {
  const [current, setCurrent] = useState(value)

  return (
    <input
      type="text"
      className={`w-full rounded border-0 px-2 py-1 text-xs outline-none focus:border-electricblue-500 ${edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"}`}
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
  edited,
  onChange
}: {
  value: string | number
  icon?: React.ReactNode
  edited?: boolean
  onChange: (val: string) => void
}) {
  const strVal = String(value)
  const [current, setCurrent] = useState(strVal)

  const bg = edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"

  const input = (
    <input
      type="text"
      className={`${icon ? "w-full bg-transparent outline-none text-xs" : `w-full rounded border-0 ${bg} px-2 py-1 text-xs outline-none focus:border-electricblue-500`}`}
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
      <div className={`flex items-center gap-1 w-full rounded border-0 ${bg} px-2 py-1 focus-within:border-electricblue-500`}>
        <span className="shrink-0 text-black dark:text-white">{icon}</span>
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
  elementId,
  flowMode,
  edited,
  onFlowChange,
  onStyleEdit,
  onUndo
}: {
  styles: StyleData
  elementId: ElementId
  flowMode: string | null
  edited: boolean
  onFlowChange: (mode: string | null) => void
  onStyleEdit: StyleEditorProps["onStyleEdit"]
  onUndo?: () => void
}) {
  const flows = [
    { mode: "column", icon: <ArrowDownFromLine size={14} />, title: "Vertical" },
    { mode: "row", icon: <ArrowRightFromLine size={14} />, title: "Horizontal" },
    { mode: "grid", icon: <LayoutGrid size={14} />, title: "Grid" }
  ]

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel edited={edited} onUndo={onUndo}>Flow</FieldLabel>
      <div className={`flex w-full rounded-lg ${edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"}`} style={{ padding: "2px" }}>
        {flows.map((f) => (
          <button
            key={f.mode}
            title={f.title}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-colors ${
              flowMode === f.mode
                ? "bg-electricblue-200 text-electricblue-700 dark:bg-electricblue-800 dark:text-electricblue-300"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
            }`}
            onClick={() => {
              const display = styles.display || "block"
              if (flowMode === f.mode) {
                onStyleEdit(elementId, "display", display, "block")
                onStyleEdit(elementId, "flexDirection", styles.flexDirection || "", "")
                if (flowMode === "grid") {
                  onStyleEdit(elementId, "gridTemplateColumns", styles.gridTemplateColumns || "", "")
                  onStyleEdit(elementId, "gridTemplateRows", styles.gridTemplateRows || "", "")
                  onStyleEdit(elementId, "columnGap", styles.columnGap || "", "")
                  onStyleEdit(elementId, "rowGap", styles.rowGap || "", "")
                }
                onFlowChange(null)
              } else if (f.mode === "grid") {
                if (flowMode !== "grid") {
                  onStyleEdit(elementId, "flexDirection", styles.flexDirection || "", "")
                }
                onStyleEdit(elementId, "display", display, "grid")
                onStyleEdit(elementId, "gridTemplateColumns", styles.gridTemplateColumns || "", "repeat(3, 1fr)")
                onFlowChange("grid")
              } else {
                if (flowMode === "grid") {
                  onStyleEdit(elementId, "gridTemplateColumns", styles.gridTemplateColumns || "", "")
                  onStyleEdit(elementId, "gridTemplateRows", styles.gridTemplateRows || "", "")
                  onStyleEdit(elementId, "columnGap", styles.columnGap || "", "")
                  onStyleEdit(elementId, "rowGap", styles.rowGap || "", "")
                }
                onStyleEdit(elementId, "display", display, "flex")
                onStyleEdit(elementId, "flexDirection", styles.flexDirection || "", f.mode)
                onFlowChange(f.mode)
              }
            }}>
            {f.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

function AlignmentGrid({
  styles,
  elementId,
  flowMode,
  editedProps,
  edited,
  onFlowChange,
  onStyleEdit,
  onUndo
}: {
  styles: StyleData
  elementId: ElementId
  flowMode: string | null
  editedProps: Map<string, { original: string; current: string; tokenName?: string }>
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

  const eff = (prop: string, fallback: string) =>
    effective(editedProps, prop, fallback)

  const activePos = useMemo(() => {
    if (!flowMode) return { col: -1, row: -1 }
    const ai = eff("alignItems", styles.alignItems || "stretch")
    const display = eff("display", styles.display || "block")
    const isFlex = display === "flex" || display === "inline-flex"
    const jc = isFlex
      ? eff("justifyContent", styles.justifyContent || "flex-start")
      : eff("justifyItems", styles.justifyItems || "start")
    let hVal: string, vVal: string
    if (flowMode === "row") {
      hVal = jc
      vVal = ai
    } else if (flowMode === "column") {
      hVal = ai
      vVal = jc
    } else {
      hVal = eff("justifyItems", styles.justifyItems || "start")
      vVal = ai
    }
    return { col: normalize(hVal), row: normalize(vVal) }
  }, [flowMode, styles, editedProps])

  const [hoveredCell, setHoveredCell] = useState<{
    row: number
    col: number
  } | null>(null)

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel edited={edited} onUndo={onUndo}>Alignment</FieldLabel>
      <div className={`grid grid-cols-3 gap-px rounded overflow-hidden w-full p-0.5 ${edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"}`}>
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
                  : "rounded dark:text-white hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
              onMouseEnter={() => setHoveredCell({ row: r, col: c })}
              onMouseLeave={() => setHoveredCell(null)}
              onClick={() => {
                let mode = flowMode
                if (!mode) {
                  const display = styles.display || "block"
                  onStyleEdit(elementId, "display", display, "flex")
                  onStyleEdit(
                    elementId,
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
                  elementId,
                  hProp,
                  styles[hProp] || "",
                  alignValues[c]
                )
                onStyleEdit(
                  elementId,
                  vProp,
                  styles[vProp] || "",
                  alignValues[r]
                )
              }}>
              {isActive || isHovered ? colIcons[c] : <Dot size={12} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function parseRepeatCount(val: string): number | null {
  const m = val.match(/^repeat\((\d+),\s*1fr\)$/)
  return m ? parseInt(m[1]) : null
}

function GridTemplateControls({
  styles,
  elementId,
  editedProps,
  onStyleEdit,
  onUndo
}: {
  styles: StyleData
  elementId: ElementId
  editedProps: Map<string, { original: string; current: string; tokenName?: string }>
  onStyleEdit: StyleEditorProps["onStyleEdit"]
  onUndo: (elementId: ElementId, props: string[]) => void
}) {
  const cols = effective(editedProps, "gridTemplateColumns", styles.gridTemplateColumns || "none")
  const rows = effective(editedProps, "gridTemplateRows", styles.gridTemplateRows || "none")
  // Computed grid-template values are always resolved to actual track sizes
  // (e.g. "960px" or "100px 50px 50px ..."), so we can't use "none" checks.
  // Instead, detect explicit user-authored templates by looking for repeat()/fr patterns.
  const isExplicitTemplate = (val: string) => /repeat\(/.test(val) || /\dfr/.test(val)
  const initialDir = isExplicitTemplate(cols) ? "columns" : isExplicitTemplate(rows) ? "rows" : "rows"
  const [templateDir, setTemplateDir] = useState<"columns" | "rows">(initialDir)

  const activeProp = templateDir === "columns" ? "gridTemplateColumns" : "gridTemplateRows"
  const inactiveProp = templateDir === "columns" ? "gridTemplateRows" : "gridTemplateColumns"
  const activeValue = effective(editedProps, activeProp, styles[activeProp] || "none")
  const count = parseRepeatCount(activeValue)

  const edited = hasAny(editedProps, "gridTemplateColumns", "gridTemplateRows")

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      <div className="flex flex-col gap-1">
        <FieldLabel edited={edited} onUndo={() => onUndo(elementId, ["gridTemplateColumns", "gridTemplateRows"])}>Template</FieldLabel>
        <div className={`flex w-full rounded-lg ${edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"}`} style={{ padding: "2px" }}>
          {([{ dir: "columns" as const, icon: <Columns size={14} />, title: "Columns" }, { dir: "rows" as const, icon: <Rows size={14} />, title: "Rows" }]).map((t) => (
            <button
              key={t.dir}
              title={t.title}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-colors ${
                templateDir === t.dir
                  ? "bg-electricblue-200 text-electricblue-700 dark:bg-electricblue-800 dark:text-electricblue-300"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
              onClick={() => {
                if (templateDir !== t.dir) {
                  setTemplateDir(t.dir)
                  const currentActiveProp = t.dir === "columns" ? "gridTemplateColumns" : "gridTemplateRows"
                  const currentInactiveProp = t.dir === "columns" ? "gridTemplateRows" : "gridTemplateColumns"
                  const currentCount = parseRepeatCount(effective(editedProps, currentActiveProp, styles[currentActiveProp] || "none"))
                  if (!currentCount) {
                    onStyleEdit(elementId, currentActiveProp, styles[currentActiveProp] || "", "repeat(3, 1fr)")
                  }
                  onStyleEdit(elementId, currentInactiveProp, styles[currentInactiveProp] || "", "")
                }
              }}>
              {t.icon}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel edited={editedProps.has(activeProp)} onUndo={() => onUndo(elementId, [activeProp])}>{templateDir === "columns" ? "Columns" : "Rows"}</FieldLabel>
        <NumericInput
          key={activeValue}
          edited={editedProps.has(activeProp)}
          value={count ?? ""}
          onChange={(val) => {
            const n = parseInt(val)
            if (n > 0) {
              onStyleEdit(elementId, activeProp, styles[activeProp] || "", `repeat(${n}, 1fr)`)
            }
          }}
        />
      </div>
    </div>
  )
}

function hasAny(editedProps: Map<string, any>, ...keys: string[]) {
  return keys.some((k) => editedProps.has(k))
}

function effective(editedProps: Map<string, { original: string; current: string; tokenName?: string }>, prop: string, fallback: string): string {
  return editedProps.get(prop)?.current ?? fallback
}

const CSS_LENGTH_RE = /^-?[\d.]+\s*(px|em|rem|%|vw|vh|vmin|vmax|ch|ex|cap|lh|svw|svh|lvw|lvh|dvw|dvh|cqw|cqh|cm|mm|in|pt|pc)$/

/** Parse a CSS length into its numeric part and unit. Bare numbers default to "px". */
function parseCssLength(val: string): { num: number; unit: string } {
  const match = val.trim().match(/^(-?[\d.]+)\s*([a-z%]*)$/)
  if (!match) return { num: 0, unit: "px" }
  return { num: parseFloat(match[1]) || 0, unit: match[2] || "px" }
}

/** Display a CSS length value, omitting the "px" unit. */
function displayCssLength(val: string): string {
  const { num, unit } = parseCssLength(val)
  return unit === "px" ? String(num) : `${num}${unit}`
}

/** Normalize user input to a CSS length. Bare numbers become px. */
function normalizeCssInput(val: string): string {
  const trimmed = val.trim()
  if (!trimmed) return "0px"
  return trimmed.match(/[a-z%]/) ? trimmed : trimmed + "px"
}

function sizeDisplayValue(authored: string): { display: string; isCustom: boolean } {
  if (!authored || authored === "auto") return { display: "", isCustom: false }
  if (CSS_LENGTH_RE.test(authored.trim())) {
    const { num, unit } = parseCssLength(authored)
    return { display: unit === "px" ? String(num) : authored.trim(), isCustom: false }
  }
  return { display: "custom", isCustom: true }
}

function SizeDimensionControl({
  label,
  prop,
  styles,
  elementId,
  editedProps,
  onStyleEdit,
  onUndo
}: {
  label: string
  prop: "width" | "height"
  styles: StyleData
  elementId: ElementId
  editedProps: Map<string, { original: string; current: string; tokenName?: string }>
  onStyleEdit: StyleEditorProps["onStyleEdit"]
  onUndo: () => void
}) {
  const authored = effective(editedProps, prop, styles[prop] || "")
  const { display, isCustom } = sizeDisplayValue(authored)
  const edited = editedProps.has(prop)
  const [current, setCurrent] = useState(display)

  const prevDisplay = useRef(display)
  if (prevDisplay.current !== display) {
    prevDisplay.current = display
    setCurrent(display)
  }

  const bg = edited ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"

  const commit = (val: string) => {
    const trimmed = val.trim()
    if (trimmed === "" || trimmed === "auto") {
      const newVal = "auto"
      if (authored !== newVal && authored !== "") onStyleEdit(elementId, prop, styles[prop] || "", newVal)
      setCurrent("")
    } else if (trimmed !== "custom") {
      const v = trimmed.match(/[a-z%]/) ? trimmed : trimmed + "px"
      onStyleEdit(elementId, prop, styles[prop] || "", v)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel edited={edited} onUndo={onUndo}>{label}</FieldLabel>
      <input
        type="text"
        placeholder="auto"
        className={`w-full rounded border-0 ${bg} px-2 py-1 text-xs outline-none focus:border-electricblue-500`}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        onBlur={() => commit(current)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
      />
    </div>
  )
}

export default function StyleEditor({
  styles,
  elementId,
  editedProps,
  lucideIconName,
  pageTokens,
  pageColors,
  isTextNode,
  onStyleEdit,
  onTextEdit,
  onUndo,
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

  const effectiveDisplay = effective(editedProps, "display", display)
  const supportsSize = effectiveDisplay !== "inline" && effectiveDisplay !== "contents"

  const padParts = (styles.padding || "0px").split(/\s+/)
  const padTopRaw = padParts[0]
  const padRightRaw = padParts[1] ?? padParts[0]
  const padBottomRaw = padParts[2] ?? padParts[0]
  const padLeftRaw = padParts[3] ?? padParts[1] ?? padParts[0]

  const marginParts = (styles.margin || "0px").split(/\s+/)
  const marginTopRaw = marginParts[0]
  const marginRightRaw = marginParts[1] ?? marginParts[0]
  const marginBottomRaw = marginParts[2] ?? marginParts[0]
  const marginLeftRaw = marginParts[3] ?? marginParts[1] ?? marginParts[0]

  return (
    <div className="flex flex-col gap-4 py-3">
      {!isTextNode && <>
      {/* Layout */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Layout</SectionLabel>
        <FlowControls
          styles={styles}
          elementId={elementId}
          flowMode={flowMode}
          edited={hasAny(editedProps, "display", "flexDirection")}
          onFlowChange={setFlowMode}
          onStyleEdit={onStyleEdit}
          onUndo={() => {
            onUndo(elementId, ["display", "flexDirection", "gridTemplateColumns", "gridTemplateRows", "columnGap", "rowGap"])
            setFlowMode(initialFlowMode)
          }}
        />
        {supportsSize && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <SizeDimensionControl
              label="Width"
              prop="width"
              styles={styles}
              elementId={elementId}
              editedProps={editedProps}
              onStyleEdit={onStyleEdit}
              onUndo={() => onUndo(elementId, ["width"])}
            />
            <SizeDimensionControl
              label="Height"
              prop="height"
              styles={styles}
              elementId={elementId}
              editedProps={editedProps}
              onStyleEdit={onStyleEdit}
              onUndo={() => onUndo(elementId, ["height"])}
            />
          </div>
        )}
        {flowMode === "grid" && (
          <GridTemplateControls
            styles={styles}
            elementId={elementId}
            editedProps={editedProps}
            onStyleEdit={onStyleEdit}
            onUndo={onUndo}
          />
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <AlignmentGrid
            styles={styles}
            elementId={elementId}
            flowMode={flowMode}
            editedProps={editedProps}
            edited={hasAny(editedProps, "justifyContent", "alignItems", "justifyItems")}
            onFlowChange={setFlowMode}
            onStyleEdit={onStyleEdit}
            onUndo={() => onUndo(elementId, ["justifyContent", "alignItems", "justifyItems"])}
          />
          {flowMode === "grid" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("columnGap")} onUndo={() => onUndo(elementId, ["columnGap"])}>Column gap</FieldLabel>
                <NumericInput
                  key={effective(editedProps, "columnGap", styles.columnGap || styles.gap || "")}
                  icon={<AlignHorizontalSpaceBetween size={14} />}
                  edited={editedProps.has("columnGap")}
                  value={parseInt(effective(editedProps, "columnGap", styles.columnGap || styles.gap || "")) || 0}
                  onChange={(val) => {
                    const v = val.match(/\d/) ? val : "0"
                    const gapVal = v.match(/[a-z%]/) ? v : v + "px"
                    onStyleEdit(elementId, "columnGap", styles.columnGap || "", gapVal)
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("rowGap")} onUndo={() => onUndo(elementId, ["rowGap"])}>Row gap</FieldLabel>
                <NumericInput
                  key={effective(editedProps, "rowGap", styles.rowGap || styles.gap || "")}
                  icon={<AlignVerticalSpaceBetween size={14} />}
                  edited={editedProps.has("rowGap")}
                  value={parseInt(effective(editedProps, "rowGap", styles.rowGap || styles.gap || "")) || 0}
                  onChange={(val) => {
                    const v = val.match(/\d/) ? val : "0"
                    const gapVal = v.match(/[a-z%]/) ? v : v + "px"
                    onStyleEdit(elementId, "rowGap", styles.rowGap || "", gapVal)
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <FieldLabel edited={editedProps.has("gap")} onUndo={() => onUndo(elementId, ["gap"])}>
                {flowMode === "column" ? "Vertical gap" : flowMode === "row" ? "Horizontal gap" : "Gap"}
              </FieldLabel>
              <NumericInput
                key={effective(editedProps, "gap", styles.gap || "")}
                icon={flowMode === "column" ? <AlignVerticalSpaceBetween size={14} /> : <AlignHorizontalSpaceBetween size={14} />}
                edited={editedProps.has("gap")}
                value={(isFlex || isGrid) ? (parseInt(effective(editedProps, "gap", styles.gap || "")) || 0) : ""}
                onChange={(val) => {
                  const v = val.match(/\d/) ? val : "0"
                  const gapVal = v.match(/[a-z%]/) ? v : v + "px"
                  onStyleEdit(elementId, "gap", styles.gap || "", gapVal)
                }}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={hasAny(editedProps, "paddingLeft", "paddingRight", "paddingTop", "paddingBottom")} onUndo={() => onUndo(elementId, ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"])}>Padding</FieldLabel>
          <div className="grid grid-cols-4 gap-x-2">
            <NumericInput
              key={`${elementId}-pt-${effective(editedProps, "paddingTop", padTopRaw)}`}
              icon={<ArrowUpFromLine size={14} />}
              edited={editedProps.has("paddingTop")}
              value={displayCssLength(effective(editedProps, "paddingTop", padTopRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "paddingTop", padTopRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-pb-${effective(editedProps, "paddingBottom", padBottomRaw)}`}
              icon={<ArrowDownFromLine size={14} />}
              edited={editedProps.has("paddingBottom")}
              value={displayCssLength(effective(editedProps, "paddingBottom", padBottomRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "paddingBottom", padBottomRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-pl-${effective(editedProps, "paddingLeft", padLeftRaw)}`}
              icon={<ArrowLeftFromLine size={14} />}
              edited={editedProps.has("paddingLeft")}
              value={displayCssLength(effective(editedProps, "paddingLeft", padLeftRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "paddingLeft", padLeftRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-pr-${effective(editedProps, "paddingRight", padRightRaw)}`}
              icon={<ArrowRightFromLine size={14} />}
              edited={editedProps.has("paddingRight")}
              value={displayCssLength(effective(editedProps, "paddingRight", padRightRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "paddingRight", padRightRaw, normalizeCssInput(val))
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={hasAny(editedProps, "marginLeft", "marginRight", "marginTop", "marginBottom")} onUndo={() => onUndo(elementId, ["marginLeft", "marginRight", "marginTop", "marginBottom"])}>Margin</FieldLabel>
          <div className="grid grid-cols-4 gap-x-2">
            <NumericInput
              key={`${elementId}-mt-${effective(editedProps, "marginTop", marginTopRaw)}`}
              icon={<ArrowUpFromLine size={14} />}
              edited={editedProps.has("marginTop")}
              value={displayCssLength(effective(editedProps, "marginTop", marginTopRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "marginTop", marginTopRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-mb-${effective(editedProps, "marginBottom", marginBottomRaw)}`}
              icon={<ArrowDownFromLine size={14} />}
              edited={editedProps.has("marginBottom")}
              value={displayCssLength(effective(editedProps, "marginBottom", marginBottomRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "marginBottom", marginBottomRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-ml-${effective(editedProps, "marginLeft", marginLeftRaw)}`}
              icon={<ArrowLeftFromLine size={14} />}
              edited={editedProps.has("marginLeft")}
              value={displayCssLength(effective(editedProps, "marginLeft", marginLeftRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "marginLeft", marginLeftRaw, normalizeCssInput(val))
              }}
            />
            <NumericInput
              key={`${elementId}-mr-${effective(editedProps, "marginRight", marginRightRaw)}`}
              icon={<ArrowRightFromLine size={14} />}
              edited={editedProps.has("marginRight")}
              value={displayCssLength(effective(editedProps, "marginRight", marginRightRaw))}
              onChange={(val) => {
                onStyleEdit(elementId, "marginRight", marginRightRaw, normalizeCssInput(val))
              }}
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Appearance */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Appearance</SectionLabel>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("opacity")} onUndo={() => onUndo(elementId, ["opacity"])}>Opacity</FieldLabel>
            <NumericInput
              key={effective(editedProps, "opacity", styles.opacity || "1")}
              icon={<Blend size={14} />}
              edited={editedProps.has("opacity")}
              value={effective(editedProps, "opacity", styles.opacity || "1")}
              onChange={(val) =>
                onStyleEdit(elementId, "opacity", styles.opacity || "1", val)
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderRadius")} onUndo={() => onUndo(elementId, ["borderRadius"])}>Corner Radius</FieldLabel>
            <NumericInput
              key={effective(editedProps, "borderRadius", styles.borderRadius || "0px")}
              icon={<Scan size={14} />}
              edited={editedProps.has("borderRadius")}
              value={parseInt(effective(editedProps, "borderRadius", styles.borderRadius || "0px")) || 0}
              onChange={(val) => {
                const v = val.match(/[a-z%]/) ? val : val + "px"
                onStyleEdit(elementId, "borderRadius", styles.borderRadius || "0px", v)
              }}
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

      {/* Fill */}
      <div className="flex flex-col gap-2">
        <SectionLabel>Fill</SectionLabel>
        <div className="flex flex-col gap-1">
          <FieldLabel edited={editedProps.has("backgroundColor")} onUndo={() => onUndo(elementId, ["backgroundColor"])}>Color</FieldLabel>
          <ColorPicker
            value={effective(editedProps, "backgroundColor", styles.backgroundColor || "transparent")}
            tokens={pageTokens}
            pageColors={pageColors}
            edited={editedProps.has("backgroundColor")}
            onChange={(val, tokenName) =>
              onStyleEdit(
                elementId,
                "backgroundColor",
                styles.backgroundColor || "transparent",
                val,
                tokenName
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
          <FieldLabel edited={editedProps.has("borderColor")} onUndo={() => onUndo(elementId, ["borderColor"])}>Color</FieldLabel>
          <ColorPicker
            value={effective(editedProps, "borderColor", styles.borderColor || "none")}
            tokens={pageTokens}
            pageColors={pageColors}
            edited={editedProps.has("borderColor")}
            onChange={(val, tokenName) =>
              onStyleEdit(
                elementId,
                "borderColor",
                styles.borderColor || "none",
                val,
                tokenName
              )
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderStyle")} onUndo={() => onUndo(elementId, ["borderStyle"])}>Position</FieldLabel>
            <div className={`flex w-full rounded-lg ${editedProps.has("borderStyle") ? "bg-mintfresh-100 dark:bg-mintfresh-800" : "bg-slate-100 dark:bg-slate-700"}`} style={{ padding: "2px" }}>
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
                    className={`flex-1 rounded-md py-1 text-xs transition-colors ${
                      isActive
                        ? "bg-electricblue-200 text-electricblue-700 dark:bg-electricblue-800 dark:text-electricblue-300"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    }`}
                    onClick={() => {
                      if (opt.value === "outside") {
                        onStyleEdit(elementId, "borderStyle", styles.borderStyle || "none", "outline")
                      } else {
                        onStyleEdit(elementId, "borderStyle", styles.borderStyle || "none", "solid")
                      }
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("borderWidth")} onUndo={() => onUndo(elementId, ["borderWidth"])}>Weight</FieldLabel>
            <NumericInput
              key={effective(editedProps, "borderWidth", styles.borderWidth || "0px")}
              edited={editedProps.has("borderWidth")}
              value={parseInt(effective(editedProps, "borderWidth", styles.borderWidth || "0px")) || 0}
              onChange={(val) => {
                const v = val.match(/[a-z%]/) ? val : val + "px"
                onStyleEdit(elementId, "borderWidth", styles.borderWidth || "0px", v)
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
          <FieldLabel edited={editedProps.has("fontFamily")} onUndo={() => onUndo(elementId, ["fontFamily"])}>Font</FieldLabel>
          <FieldInput
            key={effective(editedProps, "fontFamily", styles.fontFamily || "")}
            edited={editedProps.has("fontFamily")}
            value={effective(editedProps, "fontFamily", styles.fontFamily || "")}
            onChange={(newVal) =>
              onStyleEdit(elementId, "fontFamily", styles.fontFamily || "", newVal)
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel
            edited={editedProps.has("color")}
            onUndo={() => onUndo(elementId, ["color"])}
          >
            Color
          </FieldLabel>
          <ColorPicker
            value={effective(editedProps, "color", styles.color || "transparent")}
            tokens={pageTokens}
            pageColors={pageColors}
            edited={editedProps.has("color")}
            onChange={(val, tokenName) =>
              onStyleEdit(elementId, "color", styles.color || "transparent", val, tokenName)
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-x-4">
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("fontWeight")} onUndo={() => onUndo(elementId, ["fontWeight"])}>Weight</FieldLabel>
            <FieldInput
              key={effective(editedProps, "fontWeight", styles.fontWeight || "")}
              edited={editedProps.has("fontWeight")}
              value={effective(editedProps, "fontWeight", styles.fontWeight || "")}
              onChange={(newVal) =>
                onStyleEdit(elementId, "fontWeight", styles.fontWeight || "", newVal)
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel edited={editedProps.has("fontSize")} onUndo={() => onUndo(elementId, ["fontSize"])}>Size</FieldLabel>
            <FieldInput
              key={effective(editedProps, "fontSize", styles.fontSize || "")}
              edited={editedProps.has("fontSize")}
              value={effective(editedProps, "fontSize", styles.fontSize || "")}
              onChange={(newVal) =>
                onStyleEdit(elementId, "fontSize", styles.fontSize || "", newVal)
              }
            />
          </div>
        </div>
      </div>
      </>}

      {(styles.textContent != null || lucideIconName) && (
        <>
          <hr className="border-slate-200 dark:border-slate-700 -mx-3" />

          <div className="flex flex-col gap-2">
            <SectionLabel>Content</SectionLabel>
            {styles.textContent != null && (
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("textContent")} onUndo={() => onUndo(elementId, ["textContent"])}>Text</FieldLabel>
                <FieldInput
                  key={effective(editedProps, "textContent", styles.textContent!)}
                  edited={editedProps.has("textContent")}
                  value={effective(editedProps, "textContent", styles.textContent!)}
                  onChange={(val) => onTextEdit(elementId, styles.textContent!, val)}
                />
              </div>
            )}
            {lucideIconName && (
              <div className="flex flex-col gap-1">
                <FieldLabel edited={editedProps.has("lucideIcon")} onUndo={() => onUndo(elementId, ["lucideIcon"])}>Icon</FieldLabel>
                <IconPicker
                  currentIcon={effective(editedProps, "lucideIcon", lucideIconName)}
                  onSelect={(name) => onStyleEdit(elementId, "lucideIcon", lucideIconName, name)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
