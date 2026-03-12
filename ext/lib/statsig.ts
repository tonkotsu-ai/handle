import { StatsigClient } from "@statsig/js-client"

export enum AnalyticEvent {
  SidepanelOpened = "handle_sidepanel_opened",
  SidepanelClosed = "handle_sidepanel_closed",
  SessionActive = "handle_session_active",
  ChangesSent = "handle_changes_sent",
  ChangesCopied = "handle_changes_copied",
  PageRefreshed = "handle_page_refreshed",
  TabSwitched = "handle_tab_switched",
  SelectionModeToggled = "handle_selection_mode_toggled",
  ChangesCancelled = "handle_changes_cancelled",
}

let client: StatsigClient | null = null

export function initStatsig() {
  const key = process.env.PLASMO_PUBLIC_STATSIG_CLIENT_KEY
  if (!key) return
  client = new StatsigClient(key, {})
  client.initializeAsync()
}

export function logEvent(
  name: AnalyticEvent,
  value?: string,
  metadata?: Record<string, string>
) {
  client?.logEvent(name, value, metadata)
}
