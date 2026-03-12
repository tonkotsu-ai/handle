import { icons, Search } from "lucide-react"
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { renderToStaticMarkup } from "react-dom/server"

interface IconPickerProps {
  currentIcon: string
  onSelect: (iconName: string) => void
}

function toKebab(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
}

interface IconEntry {
  kebab: string
  pascal: string
}

const iconList: IconEntry[] = Object.keys(icons).map((pascal) => ({
  kebab: toKebab(pascal),
  pascal
}))

const iconsByKebab = new Map(iconList.map((e) => [e.kebab, e]))

export function getIconSvgChildren(kebabName: string): string | null {
  const entry = iconsByKebab.get(kebabName)
  if (!entry) return null
  const Icon = icons[entry.pascal as keyof typeof icons]
  const markup = renderToStaticMarkup(createElement(Icon, { size: 24 }))
  const match = markup.match(/<svg[^>]*>(.*)<\/svg>/s)
  return match ? match[1] : null
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
      <span className="font-bold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}

const MAX_RESULTS = 60

export default function IconPicker({ currentIcon, onSelect }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (q ? iconList.filter((e) => e.kebab.includes(q)) : iconList).slice(0, MAX_RESULTS)
  }, [search])

  const [above, setAbove] = useState(false)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const showAbove = spaceBelow < 200 && spaceAbove > spaceBelow
    const maxH = Math.min(320, showAbove ? spaceAbove : spaceBelow)
    setAbove(showAbove)
    setPopupStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight: maxH,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 })
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function handleClickOutside(e: MouseEvent) {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const currentEntry = iconsByKebab.get(currentIcon)
  const CurrentIconComponent = currentEntry ? icons[currentEntry.pascal as keyof typeof icons] : null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => {
          setOpen(!open)
          setSearch("")
        }}
        className="flex items-center gap-2 rounded bg-white dark:bg-slate-800 px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 w-full">
        {CurrentIconComponent && createElement(CurrentIconComponent, { size: 14 })}
        <span className="truncate text-slate-600 dark:text-slate-300">{currentIcon}</span>
      </button>
      {open && (() => {
        const searchInput = (
          <div className={`p-2 ${above ? "border-t" : "border-b"} border-slate-200 dark:border-slate-700`}>
            <div className="flex items-center gap-1.5 px-2 py-1">
              <Search size={12} className="shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search icons..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>
        )
        return createPortal(
        <div
          ref={popupRef}
          className="z-50 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg flex flex-col"
          style={popupStyle}>
          {searchInput}
          <div className={`overflow-y-auto p-1.5 ${above ? "order-first" : ""}`}>
            {filtered.map((entry) => {
              const Icon = icons[entry.pascal as keyof typeof icons]
              return (
                <button
                  key={entry.kebab}
                  onClick={() => {
                    onSelect(entry.kebab)
                    setOpen(false)
                  }}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs w-full ${
                    entry.kebab === currentIcon
                      ? "bg-electricblue-100 text-electricblue-700 dark:bg-electricblue-900 dark:text-electricblue-300"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}>
                  {createElement(Icon, { size: 16 })}
                  <span className="truncate">{highlightMatch(entry.kebab, search)}</span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-400">
                No icons found
              </div>
            )}
          </div>
        </div>,
        document.body
      )})()}
    </>
  )
}
