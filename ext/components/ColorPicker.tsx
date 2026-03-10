import { Search } from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"

import {
  formatColor,
  getOpacity,
  normalizeToHex,
  parseColor,
  withOpacity,
} from "~utils/color"

interface ColorPickerProps {
  value: string
  tabId: number | null
  onChange: (val: string) => void
}

interface TokenEntry {
  name: string
  value: string
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
  const [colorFormat, setColorFormat] = useState<"hex" | "rgba">(
    "hex"
  )
  const displayValue = parsed
    ? formatColor(parsed, colorFormat)
    : value
  const [inputValue, setInputValue] = useState(
    colorFormat === "hex" && parsed
      ? formatColor(parsed, "hex").replace(/^#/, "")
      : displayValue
  )
  const [opacityInput, setOpacityInput] = useState(
    String(parsed ? getOpacity(parsed) : 100)
  )

  const currentHex = parsed ? normalizeToHex(value) : value

  // Sync input when value prop changes
  useEffect(() => {
    const p = parseColor(value)
    if (p) {
      setInputValue(
        colorFormat === "hex"
          ? formatColor(p, "hex").replace(/^#/, "")
          : formatColor(p, "rgba")
      )
      setOpacityInput(String(getOpacity(p)))
    }
  }, [value, colorFormat])

  function commitInput() {
    const raw =
      colorFormat === "hex" && !inputValue.startsWith("#")
        ? `#${inputValue}`
        : inputValue
    const p = parseColor(raw)
    if (p) onChange(formatColor(p, colorFormat))
  }

  function commitOpacity() {
    const pct = parseInt(opacityInput)
    if (parsed && !isNaN(pct)) {
      const updated = withOpacity(parsed, pct)
      onChange(formatColor(updated, colorFormat))
    }
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    commit: () => void
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
    <div className="flex flex-col gap-3 p-3">
      {/* Fill type */}
      <select className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs outline-none focus:border-electricblue-500">
        <option>Solid fill</option>
      </select>

      {/* Format row */}
      <div className="flex items-center gap-2">
        <select
          value={colorFormat}
          onChange={(e) =>
            setColorFormat(e.target.value as "hex" | "rgba")
          }
          className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs outline-none focus:border-electricblue-500">
          <option value="hex">Hex</option>
          <option value="rgba">RGBA</option>
        </select>
        <Swatch color={value} size={20} />
        <input
          type="text"
          className="flex-1 min-w-0 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs outline-none focus:border-electricblue-500"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commitInput}
          onKeyDown={(e) => handleKeyDown(e, commitInput)}
        />
        <div className="flex items-center gap-0.5">
          <input
            type="text"
            className="w-10 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1.5 py-1 text-xs text-center outline-none focus:border-electricblue-500"
            value={opacityInput}
            onChange={(e) => setOpacityInput(e.target.value)}
            onBlur={commitOpacity}
            onKeyDown={(e) =>
              handleKeyDown(e, commitOpacity)
            }
          />
          <span className="text-xs text-slate-400">%</span>
        </div>
      </div>

      {/* Divider */}
      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Other colors on this page */}
      {normalizedPageColors.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Other colors on this page
          </div>
          <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
            {normalizedPageColors.map(({ raw, hex }) => (
              <button
                key={hex}
                onClick={() => onChange(hex)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs w-full ${
                  hex.toLowerCase() ===
                  currentHex.toLowerCase()
                    ? "bg-electricblue-100 text-electricblue-700 dark:bg-electricblue-900 dark:text-electricblue-300"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}>
                <Swatch color={raw} size={16} />
                <span>{hex}</span>
              </button>
            ))}
          </div>
        </div>
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
  onChange: (val: string) => void
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
    return q
      ? tokens.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.value.toLowerCase().includes(q)
        )
      : tokens
  }, [search, tokens])

  return (
    <div className="flex flex-col">
      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 focus-within:border-electricblue-500">
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
          const hex = normalizeToHex(token.value)
          return (
            <button
              key={token.name}
              onClick={() => {
                onChange(hex)
                onClose()
              }}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs w-full ${
                hex.toLowerCase() ===
                currentHex.toLowerCase()
                  ? "bg-electricblue-100 text-electricblue-700 dark:bg-electricblue-900 dark:text-electricblue-300"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}>
              <Swatch color={token.value} size={16} />
              <span className="truncate flex-1 text-left">
                {highlightMatch(displayName, search)}
              </span>
              <span className="shrink-0 text-slate-400 dark:text-slate-500">
                {hex}
              </span>
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
  tabId,
  onChange,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<
    "custom" | "tokens"
  >("custom")
  const [pageColors, setPageColors] = useState<string[]>([])
  const [pageTokens, setPageTokens] = useState<TokenEntry[]>(
    []
  )
  const [popupStyle, setPopupStyle] =
    useState<React.CSSProperties>({})
  const [above, setAbove] = useState(false)

  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const displayHex = normalizeToHex(value)

  // Fetch page colors and tokens when popup opens
  useEffect(() => {
    if (!open || tabId == null) return
    chrome.tabs
      .sendMessage(tabId, { type: "get-page-colors" })
      .then((colors) => {
        if (Array.isArray(colors)) setPageColors(colors)
      })
      .catch(() => {})
    chrome.tabs
      .sendMessage(tabId, { type: "get-page-tokens" })
      .then((tokens) => {
        if (Array.isArray(tokens)) setPageTokens(tokens)
      })
      .catch(() => {})
  }, [open, tabId])

  // Position popup
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const popupW = Math.max(rect.width, 280)
    const spaceBelow =
      window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const showAbove =
      spaceBelow < 260 && spaceAbove > spaceBelow
    const maxH = Math.min(
      400,
      showAbove ? spaceAbove : spaceBelow
    )
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

  // Click outside to close
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
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      )
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          setOpen(!open)
        }}
        className="flex items-center gap-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 w-full">
        <Swatch color={value} size={16} />
        <span className="truncate text-slate-600 dark:text-slate-300">
          {displayHex}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popupRef}
            className="z-50 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg flex flex-col overflow-hidden"
            style={popupStyle}>
            {/* Tab bar */}
            <div className="flex">
              {(["custom", "tokens"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-3 py-2 text-xs font-medium ${
                      activeTab === tab
                        ? "bg-electricblue-500 text-white"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}>
                    {tab === "custom"
                      ? "Custom"
                      : "Tokens"}
                  </button>
                )
              )}
            </div>
            {/* Tab content */}
            {activeTab === "custom" ? (
              <CustomTab
                value={value}
                pageColors={pageColors}
                onChange={(val) => {
                  onChange(val)
                }}
              />
            ) : (
              <TokensTab
                value={value}
                tokens={pageTokens}
                onChange={(val) => {
                  onChange(val)
                }}
                onClose={() => setOpen(false)}
              />
            )}
          </div>,
          document.body
        )}
    </>
  )
}
