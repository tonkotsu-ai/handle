import { ArrowUp, ChevronDown, Clipboard, Check, Copy, GitBranch } from "lucide-react"
import { useRef, useState } from "react"

import type { SessionInfo } from "~types"

interface SendBarProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo | null) => void
  changeCount: number
  onSend: () => void
  onStop: () => void
  onCopy: () => void
  agentName: string | null
}

function InstallHint({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout>>(null)
  const cmd = "npx handle-ext@latest init"

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd).catch(() => {})
    setCopied(true)
    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <span className="border-b border-dashed border-slate-400 dark:border-slate-500 cursor-default">
        {children}
      </span>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0 pb-2 z-50">
          <span className="relative block w-64 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-lg p-2.5 text-left">
            <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Install the MCP server
            </span>
            <span className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-1.5">
              <code className="flex-1 text-[11px] font-mono text-slate-600 dark:text-slate-300 select-all whitespace-nowrap">
                {cmd}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Copy command">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-white dark:bg-slate-800 border-r border-b border-slate-200 dark:border-slate-600" />
          </span>
        </span>
      )}
    </span>
  )
}

export default function SendBar({
  sessions,
  selectedSession,
  onSelectSession,
  changeCount,
  onSend,
  onStop,
  onCopy,
  agentName
}: SendBarProps) {
  const canSend = changeCount > 0 && selectedSession != null
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 p-2 flex flex-col gap-2 bg-softgray dark:bg-softgray-dark">
      {sessions.length === 0 && (
        <div className="px-2 py-1 text-xs text-slate-400 dark:text-slate-500 text-center">
          No active MCP connections found. Use the <span className="font-mono font-medium text-slate-500 dark:text-slate-400">/handle</span> command{" "}
          <InstallHint>in your coding agent</InstallHint> to connect.
        </div>
      )}

      {sessions.length === 1 && selectedSession && (
        <div className="flex flex-col gap-0.5 px-2">
          <div className="flex items-center gap-1.5 text-xs">
            <GitBranch size={12} className="shrink-0 text-black dark:text-slate-100" />
            <span className="font-bold text-black dark:text-slate-100" style={{ fontSize: "12px" }}>
              {selectedSession.repo}
            </span>
          </div>
          {selectedSession.context && (
            <div className="truncate pl-5 text-xs text-slate-400 dark:text-slate-500" title={selectedSession.context}>
              {selectedSession.context}
            </div>
          )}
        </div>
      )}

      {sessions.length > 1 && (
        <div className="relative">
          <GitBranch
            size={12}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-electricblue-500"
          />
          <select
            value={selectedSession?.id ?? ""}
            onChange={(e) => {
              const session = sessions.find((s) => s.id === e.target.value) ?? null
              onSelectSession(session)
            }}
            className="w-full appearance-none rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 py-1.5 pl-7 pr-7 text-xs font-medium text-slate-600 dark:text-slate-300 focus:border-electricblue-500 focus:outline-none">
            <option value="" disabled>
              Select a session…
            </option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.repo}
                {session.context ? ` · ${session.context}` : ""}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
      )}

      <div className="flex items-stretch gap-1.5">
        <button
          onClick={onSend}
          disabled={!canSend}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
            canSend
              ? "bg-electricblue-700 hover:bg-electricblue-800 text-white"
              : "bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
          }`}>
          <ArrowUp size={14} />
          {selectedSession && agentName ? `Send to ${agentName}` : "Send to Coding Agent"}
          {changeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-juicyorange-500 px-1.5 text-xs text-white">
              {changeCount}
            </span>
          )}
        </button>
        {selectedSession && (
          <button
            onClick={onStop}
            title="End the live session — your coding agent will stop waiting for feedback"
            className="flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-sm font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600">
            Stop
          </button>
        )}
        <button
          onClick={handleCopy}
          disabled={changeCount === 0}
          title="Copy changes to clipboard"
          className={`flex shrink-0 items-center justify-center rounded-full px-3 py-1.5 text-sm font-bold ${
            changeCount === 0
              ? "bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              : canSend
                ? "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                : "bg-electricblue-700 hover:bg-electricblue-800 text-white"
          }`}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
        </button>
      </div>
    </div>
  )
}
