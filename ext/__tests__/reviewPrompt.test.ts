import { describe, expect, it } from "vitest"
import { shouldShow, type ReviewPromptState } from "../lib/reviewPrompt"

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

describe("shouldShow", () => {
  it("does not show below the threshold", () => {
    const state: ReviewPromptState = { successfulSendCount: 2, status: "pending" }
    expect(shouldShow(state, NOW)).toBe(false)
  })

  it("shows at the threshold", () => {
    const state: ReviewPromptState = { successfulSendCount: 3, status: "pending" }
    expect(shouldShow(state, NOW)).toBe(true)
  })

  it("shows above the threshold", () => {
    const state: ReviewPromptState = { successfulSendCount: 50, status: "pending" }
    expect(shouldShow(state, NOW)).toBe(true)
  })

  it("never shows when dismissed, even with high count", () => {
    const state: ReviewPromptState = { successfulSendCount: 100, status: "dismissed" }
    expect(shouldShow(state, NOW)).toBe(false)
  })

  it("never shows when already rated", () => {
    const state: ReviewPromptState = { successfulSendCount: 100, status: "rated" }
    expect(shouldShow(state, NOW)).toBe(false)
  })

  it("hides during snooze window", () => {
    const state: ReviewPromptState = {
      successfulSendCount: 5,
      status: "snoozed",
      snoozedUntil: NOW + 7 * DAY,
    }
    expect(shouldShow(state, NOW)).toBe(false)
  })

  it("shows again after snooze window expires", () => {
    const state: ReviewPromptState = {
      successfulSendCount: 5,
      status: "snoozed",
      snoozedUntil: NOW - DAY,
    }
    expect(shouldShow(state, NOW)).toBe(true)
  })
})
