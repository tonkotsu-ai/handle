import { ChevronDown, Pipette, Search } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

import type { TokenEntry } from "../types"
import type { HSV } from "../utils/color"
import {
  formatColor,
  getOpacity,
  hsvToRgba,
  normalizeToHex,
  normalizeToHex6,
  parseColor,
  rgbaToHex6,
  rgbaToHsv,
  rgbaToString,
  withOpacity,
} from "../utils/color"

interface EyeDropperResult {
  sRGBHex: string
}

interface EyeDropperInstance {
  open: (opts?: { signal?: AbortSignal }) => Promise<EyeDropperResult>
}

interface EyeDropperConstructor {
  new (): EyeDropperInstance
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor
  }
}

export interface ColorPickerProps {
  value: string
  pageColors?: string[]
  tokens?: TokenEntry[]
  edited?: boolean
  onChange: (val: string, tokenName?: string) => void
}

function highlightMatch(text: string, query: string) {
  if (!query) return text
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  )
}

function Swatch({
  color,
  size = 16,
  selected,
  className = "",
  onClick,
}: {
  color: string
  size?: number
  selected?: boolean
  className?: string
  onClick?: () => void
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      onClick={onClick}
      className={`shrink-0 rounded-full border ${
        selected
          ? "border-electricblue-500 ring-2 ring-electricblue-300 dark:ring-electricblue-700"
          : "border-slate-300 dark:border-slate-600"
      } ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
      }}>
      <div
        className="w-full h-full rounded-full"
        style={{ background: color }}
      />
    </Tag>
  )
}

function SaturationValueArea({
  hue,
  saturation,
  value,
  onChange,
}: {
  hue: number
  saturation: number
  value: number
  onChange: (s: number, v: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    // Fill with the pure hue
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`
    ctx.fillRect(0, 0, w, h)

    // White gradient left to right
    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0)
    whiteGrad.addColorStop(0, "rgba(255,255,255,1)")
    whiteGrad.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = whiteGrad
    ctx.fillRect(0, 0, w, h)

    // Black gradient top to bottom
    const blackGrad = ctx.createLinearGradient(0, 0, 0, h)
    blackGrad.addColorStop(0, "rgba(0,0,0,0)")
    blackGrad.addColorStop(1, "rgba(0,0,0,1)")
    ctx.fillStyle = blackGrad
    ctx.fillRect(0, 0, w, h)
  }, [hue])

  const handlePointer = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
      onChange(x / rect.width, 1 - y / rect.height)
    },
    [onChange]
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragging.current) handlePointer(e)
    }
    function onUp() {
      dragging.current = false
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [handlePointer])

  return (
    <div
      ref={containerRef}
      className="relative cursor-crosshair rounded-md overflow-hidden"
      style={{ height: 148 }}
      onMouseDown={(e) => {
        dragging.current = true
        handlePointer(e)
      }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${saturation * 100}%`,
          top: `${(1 - value) * 100}%`,
          width: 12,
          height: 12,
          marginLeft: -6,
          marginTop: -6,
          borderRadius: "50%",
          border: "2px solid white",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.3)",
        }}
      />
    </div>
  )
}

function HueSlider({
  hue,
  onChange,
}: {
  hue: number
  onChange: (h: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, "hsl(0,100%,50%)")
    grad.addColorStop(1 / 6, "hsl(60,100%,50%)")
    grad.addColorStop(2 / 6, "hsl(120,100%,50%)")
    grad.addColorStop(3 / 6, "hsl(180,100%,50%)")
    grad.addColorStop(4 / 6, "hsl(240,100%,50%)")
    grad.addColorStop(5 / 6, "hsl(300,100%,50%)")
    grad.addColorStop(1, "hsl(360,100%,50%)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }, [])

  const handlePointer = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      onChange((x / rect.width) * 360)
    },
    [onChange]
  )

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragging.current) handlePointer(e)
    }
    function onUp() {
      dragging.current = false
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [handlePointer])

  return (
    <div
      ref={containerRef}
      className="relative cursor-pointer rounded-full overflow-hidden"
      style={{ height: 14 }}
      onMouseDown={(e) => {
        dragging.current = true
        handlePointer(e)
      }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      <div
        className="absolute pointer-events-none top-0"
        style={{
          left: `${(hue / 360) * 100}%`,
          width: 6,
          height: 14,
          marginLeft: -3,
          borderRadius: 3,
          border: "2px solid white",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
        }}
      />
    </div>
  )
}

function CustomTab({
  value,
  pageColors,
  onChange,
}: {
  value: string
  pageColors: string[]
  onChange: (val: string) => void
}) {
  const parsed = parseColor(value)
  const [colorFormat, setColorFormat] = useState<"hex" | "rgba">("hex")
  const [inputValue, setInputValue] = useState(
    colorFormat === "hex" && parsed
      ? rgbaToHex6(parsed).replace(/^#/, "")
      : parsed
        ? formatColor(parsed, colorFormat)
        : value
  )
  const [opacityInput, setOpacityInput] = useState(
    String(parsed ? getOpacity(parsed) : 100)
  )

  // HSV state for the visual picker
  const initialHsv = parsed ? rgbaToHsv(parsed) : { h: 0, s: 1, v: 1 }
  const [hsv, setHsv] = useState<HSV>(initialHsv)
  const pickerChange = useRef(false)
  // Remember hue when saturation/value are 0 (hue becomes ambiguous)
  const lastHue = useRef(initialHsv.h)

  const currentHex = parsed ? normalizeToHex(value) : value

  useEffect(() => {
    const p = parseColor(value)
    if (p) {
      setInputValue(
        colorFormat === "hex"
          ? rgbaToHex6(p).replace(/^#/, "")
          : formatColor(p, "rgba")
      )
      setOpacityInput(String(getOpacity(p)))

      // Update HSV from external changes (not from picker drag)
      if (!pickerChange.current) {
        const newHsv = rgbaToHsv(p)
        // Preserve last known hue for achromatic colors
        if (newHsv.s === 0 || newHsv.v === 0) {
          newHsv.h = lastHue.current
        } else {
          lastHue.current = newHsv.h
        }
        setHsv(newHsv)
      }
      pickerChange.current = false
    }
  }, [value, colorFormat])

  function emitColor(rgba: { r: number; g: number; b: number; a: number }) {
    // Always emit full-fidelity color (rgba string when alpha < 1, hex when opaque)
    if (rgba.a < 1) {
      onChange(rgbaToString(rgba))
    } else {
      onChange(rgbaToHex6(rgba))
    }
  }

  function handleSVChange(s: number, v: number) {
    const newHsv = { h: hsv.h, s, v }
    setHsv(newHsv)
    pickerChange.current = true
    const rgba = hsvToRgba(newHsv, parsed?.a ?? 1)
    emitColor(rgba)
  }

  function handleHueChange(h: number) {
    const newHsv = { ...hsv, h }
    setHsv(newHsv)
    lastHue.current = h
    pickerChange.current = true
    const rgba = hsvToRgba(newHsv, parsed?.a ?? 1)
    emitColor(rgba)
  }

  function commitInput() {
    const raw =
      colorFormat === "hex" && !inputValue.startsWith("#")
        ? `#${inputValue}`
        : inputValue
    const p = parseColor(raw)
    if (p) {
      // Preserve current opacity when editing hex
      if (colorFormat === "hex" && parsed) {
        p.a = parsed.a
      }
      emitColor(p)
    }
  }

  function commitOpacity() {
    const pct = parseInt(opacityInput)
    if (parsed && !isNaN(pct)) {
      const updated = withOpacity(parsed, pct)
      emitColor(updated)
    }
  }

  async function handleEyedropper() {
    if (typeof window === "undefined" || !window.EyeDropper) return
    try {
      const result = await new window.EyeDropper().open()
      const picked = parseColor(result.sRGBHex)
      if (!picked) return
      // Preserve current alpha; sampled colors are always opaque sRGB.
      if (parsed) picked.a = parsed.a
      emitColor(picked)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("EyeDropper failed:", err)
    }
  }

  const eyeDropperSupported =
    typeof window !== "undefined" && typeof window.EyeDropper === "function"

  function handleKeyDown(
    e: React.KeyboardEvent,
    _commit: () => void
  ) {
    if (e.key === "Enter")
      (e.target as HTMLInputElement).blur()
  }

  const normalizedPageColors = useMemo(
    () =>
      pageColors.map((c) => ({
        raw: c,
        hex: normalizeToHex(c),
      })),
    [pageColors]
  )

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Saturation/Value area */}
      <SaturationValueArea
        hue={hsv.h}
        saturation={hsv.s}
        value={hsv.v}
        onChange={handleSVChange}
      />

      {/* Hue slider */}
      <HueSlider hue={hsv.h} onChange={handleHueChange} />

      {/* Format + hex/rgba input + opacity */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            value={colorFormat}
            onChange={(e) =>
              setColorFormat(e.target.value as "hex" | "rgba")
            }
            className="appearance-none rounded-md bg-slate-100 dark:bg-slate-600 pl-2 pr-6 py-1.5 text-xs outline-none">
            <option value="hex">Hex</option>
            <option value="rgba">RGBA</option>
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
        {eyeDropperSupported && (
          <button
            type="button"
            onClick={handleEyedropper}
            title="Pick color from screen"
            className="flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-600 px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-500 outline-none">
            <Pipette size={12} />
          </button>
        )}
        <div className="flex flex-1 min-w-0 gap-px rounded-md overflow-hidden">
          <div className="flex flex-1 min-w-0 items-center gap-2 px-2 py-1.5 bg-slate-100 dark:bg-slate-600">
            <Swatch color={value} size={16} />
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={commitInput}
              onKeyDown={(e) => handleKeyDown(e, commitInput)}
            />
          </div>
          <div className="flex items-center gap-0.5 pl-2 pr-1 py-1.5 bg-slate-100 dark:bg-slate-600">
            <input
              type="text"
              className="w-8 bg-transparent text-xs text-center outline-none"
              value={opacityInput}
              onChange={(e) => setOpacityInput(e.target.value)}
              onBlur={commitOpacity}
              onKeyDown={(e) => handleKeyDown(e, commitOpacity)}
            />
            <span className="text-xs text-slate-400 pr-0.5">%</span>
          </div>
        </div>
      </div>

      {normalizedPageColors.length > 0 && (
        <>
          <hr className="-mx-3 border-slate-200 dark:border-slate-700" />
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Other colors on this page
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {normalizedPageColors.map(({ raw, hex }) => (
                <Swatch
                  key={hex}
                  color={raw}
                  size={24}
                  selected={hex.toLowerCase() === currentHex.toLowerCase()}
                  onClick={() => onChange(hex)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TokensTab({
  value,
  tokens,
  onChange,
  onClose,
}: {
  value: string
  tokens: TokenEntry[]
  onChange: (val: string, tokenName?: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const currentHex = normalizeToHex(value)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const list = q
      ? tokens.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.value.toLowerCase().includes(q)
        )
      : [...tokens]
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [search, tokens])

  return (
    <div className="flex flex-col">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <Search
            size={12}
            className="shrink-0 text-slate-400"
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search color tokens"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs outline-none"
          />
        </div>
      </div>
      <div className="overflow-y-auto p-1.5 max-h-60">
        {filtered.map((token) => {
          const displayName = token.name.replace(/^--/, "")
          const fullTokenHex = normalizeToHex(token.value)
          const displayTokenHex = normalizeToHex6(token.value)
          const tokenParsed = parseColor(token.value)
          const tokenOpacity = tokenParsed ? getOpacity(tokenParsed) : 100
          return (
            <button
              key={token.name}
              onClick={() => {
                onChange(displayTokenHex, token.name)
                onClose()
              }}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs w-full ${
                fullTokenHex.toLowerCase() ===
                currentHex.toLowerCase()
                  ? "bg-electricblue-100 text-electricblue-700 dark:bg-electricblue-900 dark:text-electricblue-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}>
              <Swatch color={token.value} size={16} />
              <span className="truncate flex-1 text-left">
                {highlightMatch(displayName, search)}
              </span>
              {displayTokenHex.startsWith("#") && (
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                  {displayTokenHex}
                  {tokenOpacity < 100 && ` ${tokenOpacity}%`}
                </span>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="py-4 text-center text-xs text-slate-400">
            No tokens found
          </div>
        )}
      </div>
    </div>
  )
}

export default function ColorPicker({
  value,
  pageColors: pageColorsProp,
  tokens: tokensProp,
  edited,
  onChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"custom" | "tokens">("custom")
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const [above, setAbove] = useState(false)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const parsedValue = parseColor(value)
  const isTransparent = parsedValue != null && parsedValue.a === 0
  const displayHex = isTransparent ? "transparent" : normalizeToHex6(value)
  const displayOpacity = parsedValue ? getOpacity(parsedValue) : 100
  const fullHex = normalizeToHex(value)
  const tokens = tokensProp ?? []
  const pageColors = pageColorsProp ?? []

  const matchingToken = useMemo(() => {
    if (tokens.length === 0 || isTransparent) return null
    const hex = fullHex.toLowerCase()
    return tokens.find(
      (t) => normalizeToHex(t.value).toLowerCase() === hex
    ) ?? null
  }, [tokens, fullHex, isTransparent])

  const filteredPageColors = useMemo(() => {
    if (tokens.length === 0) return pageColors
    const tokenHexes = new Set(
      tokens.map((t) => normalizeToHex(t.value).toLowerCase())
    )
    return pageColors.filter(
      (c) => !tokenHexes.has(normalizeToHex(c).toLowerCase())
    )
  }, [pageColors, tokens])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const popupW = Math.max(rect.width, 280)
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const showAbove = spaceBelow < 340 && spaceAbove > spaceBelow
    const maxH = Math.min(520, showAbove ? spaceAbove : spaceBelow)
    setAbove(showAbove)
    const left = Math.max(
      0,
      Math.min(rect.left, window.innerWidth - popupW)
    )
    setPopupStyle({
      position: "fixed",
      left,
      width: popupW,
      maxHeight: maxH,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () =>
      document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open) setActiveTab(matchingToken ? "tokens" : "custom")
          setOpen(!open)
        }}
        className={`flex items-center gap-2 rounded border-0 px-2 py-1.5 text-xs w-full ${edited ? "bg-mintfresh-100 dark:bg-mintfresh-800 hover:bg-mintfresh-200 dark:hover:bg-mintfresh-700" : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>
        <Swatch color={value} size={16} />
        {matchingToken ? (
          <span className="truncate">
            <span className="font-bold text-slate-800 dark:text-slate-200">{matchingToken.name.replace(/^--/, "")}</span>
            {" "}
            <span className="text-slate-500 dark:text-slate-300">{displayHex}</span>
            {!isTransparent && displayOpacity < 100 && (
              <span className="text-slate-400 dark:text-slate-500"> {displayOpacity}%</span>
            )}
          </span>
        ) : (
          <span className="truncate text-slate-600 dark:text-slate-300">
            {displayHex}
            {!isTransparent && displayOpacity < 100 && (
              <span className="text-slate-400 dark:text-slate-500"> {displayOpacity}%</span>
            )}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            className="z-50 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg flex flex-col overflow-hidden"
            style={popupStyle}>
            <div className="p-1.5">
              <div className="flex w-full rounded-lg bg-slate-100 dark:bg-slate-700" style={{ padding: "2px" }}>
                {(["custom", "tokens"] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 rounded-md py-1 text-xs transition-colors ${
                        activeTab === tab
                          ? "bg-white font-bold text-electricblue-700 shadow-sm dark:bg-slate-600 dark:text-electricblue-300"
                          : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                      }`}>
                      {tab === "custom" ? "Custom" : "Tokens"}
                    </button>
                  )
                )}
              </div>
            </div>
            {activeTab === "custom" ? (
              <CustomTab
                value={value}
                pageColors={filteredPageColors}
                onChange={(val) => onChange(val)}
              />
            ) : (
              <TokensTab
                value={value}
                tokens={tokens}
                onChange={(val, tokenName) => onChange(val, tokenName)}
                onClose={() => setOpen(false)}
              />
            )}
          </div>,
          document.body
        )}
    </>
  )
}
