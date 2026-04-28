const STORAGE_KEY = "reviewPrompt"
const SHOW_AT_COUNT = 3
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export const REVIEW_URL =
  "https://chrome.google.com/webstore/detail/pfcfpjololfdopoglgplmijaohidmopj/reviews"

export type ReviewPromptStatus =
  | "pending"
  | "snoozed"
  | "dismissed"
  | "rated"

export type ReviewPromptState = {
  successfulSendCount: number
  status: ReviewPromptStatus
  snoozedUntil?: number
}

const DEFAULT_STATE: ReviewPromptState = {
  successfulSendCount: 0,
  status: "pending",
}

export async function loadState(): Promise<ReviewPromptState> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const stored = result[STORAGE_KEY] as ReviewPromptState | undefined
  return stored ?? { ...DEFAULT_STATE }
}

async function saveState(state: ReviewPromptState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
}

export async function recordSuccessfulSend(): Promise<void> {
  const state = await loadState()
  state.successfulSendCount += 1
  await saveState(state)
}

export async function snooze(): Promise<void> {
  const state = await loadState()
  state.status = "snoozed"
  state.snoozedUntil = Date.now() + SNOOZE_MS
  await saveState(state)
}

export async function dismiss(): Promise<void> {
  const state = await loadState()
  state.status = "dismissed"
  delete state.snoozedUntil
  await saveState(state)
}

export async function markRated(): Promise<void> {
  const state = await loadState()
  state.status = "rated"
  delete state.snoozedUntil
  await saveState(state)
}

export function shouldShow(state: ReviewPromptState, now: number): boolean {
  if (state.status === "dismissed" || state.status === "rated") return false
  if (state.successfulSendCount < SHOW_AT_COUNT) return false
  if (
    state.status === "snoozed" &&
    state.snoozedUntil != null &&
    now < state.snoozedUntil
  ) {
    return false
  }
  return true
}
