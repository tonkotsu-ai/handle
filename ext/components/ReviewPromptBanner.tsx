import { Star, X } from "lucide-react"
import { useEffect } from "react"
import { AnalyticEvent, logEvent } from "~lib/statsig"
import {
  REVIEW_URL,
  dismiss,
  markRated,
  snooze,
} from "~lib/reviewPrompt"

interface ReviewPromptBannerProps {
  onClose: () => void
}

export default function ReviewPromptBanner({ onClose }: ReviewPromptBannerProps) {
  useEffect(() => {
    logEvent(AnalyticEvent.ReviewPromptShown)
  }, [])

  const handleRate = async () => {
    logEvent(AnalyticEvent.ReviewPromptRated)
    await markRated()
    chrome.tabs.create({ url: REVIEW_URL, active: true })
    onClose()
  }

  const handleSnooze = async () => {
    logEvent(AnalyticEvent.ReviewPromptSnoozed)
    await snooze()
    onClose()
  }

  const handleDismiss = async () => {
    logEvent(AnalyticEvent.ReviewPromptDismissed)
    await dismiss()
    onClose()
  }

  return (
    <div className="relative shrink-0 mx-3 my-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm">
      <button
        onClick={handleSnooze}
        title="Remind me later"
        className="absolute top-1.5 right-1.5 p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
        <X size={12} />
      </button>
      <div className="flex items-start gap-2 pr-5">
        <Star size={14} className="text-juicyorange-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 dark:text-slate-200">
          Enjoying Handle? A quick review on the Chrome Web Store helps a lot.
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={handleRate}
          className="flex-1 rounded-md bg-electricblue-600 hover:bg-electricblue-700 text-white text-xs font-bold py-1.5 transition-colors">
          Rate
        </button>
        <button
          onClick={handleSnooze}
          className="flex-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium py-1.5 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
          Later
        </button>
        <button
          onClick={handleDismiss}
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 transition-colors">
          No thanks
        </button>
      </div>
    </div>
  )
}
