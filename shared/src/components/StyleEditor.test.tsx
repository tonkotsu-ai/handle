import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { StyleData } from "../types"

import StyleEditor from "./StyleEditor"

afterEach(() => {
  cleanup()
})

function createStyles(overrides: Partial<StyleData> = {}): StyleData {
  return {
    fontFamily: "Inter",
    fontWeight: "400",
    fontSize: "16px",
    padding: "0px",
    margin: "0px",
    display: "block",
    borderRadius: "0px",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: "0px",
    borderStyle: "none",
    ...overrides,
  }
}

describe("StyleEditor content controls", () => {
  it("uses a multiline text field capped at three rows for text content", () => {
    render(
      <StyleEditor
        styles={createStyles({ textContent: "Hero headline" })}
        elementId="hero-text"
        editedProps={new Map()}
        isTextNode
        onStyleEdit={vi.fn()}
        onTextEdit={vi.fn()}
        onUndo={vi.fn()}
      />
    )

    const textField = screen.getByDisplayValue("Hero headline")

    expect(textField.tagName).toBe("TEXTAREA")
    expect((textField as HTMLTextAreaElement).rows).toBe(1)
    expect((textField as HTMLTextAreaElement).style.maxHeight).toBe("4rem")
    expect((textField as HTMLTextAreaElement).style.overflowY).toBe("auto")
  })

  it("commits multiline text edits on blur", () => {
    const onTextEdit = vi.fn()
    render(
      <StyleEditor
        styles={createStyles({ textContent: "Hero headline" })}
        elementId="hero-text"
        editedProps={new Map()}
        isTextNode
        onStyleEdit={vi.fn()}
        onTextEdit={onTextEdit}
        onUndo={vi.fn()}
      />
    )

    const textField = screen.getByDisplayValue("Hero headline")
    fireEvent.change(textField, { target: { value: "Hero headline\nSecond line" } })
    fireEvent.blur(textField)

    expect(onTextEdit).toHaveBeenCalledWith("hero-text", "Hero headline", "Hero headline\nSecond line")
  })
})

describe("StyleEditor instructions", () => {
  it("labels the free-form input as Instructions", () => {
    render(
      <StyleEditor
        styles={createStyles()}
        elementId="heading"
        editedProps={new Map()}
        note=""
        elementLabel="h1.hero"
        onStyleEdit={vi.fn()}
        onTextEdit={vi.fn()}
        onUndo={vi.fn()}
        onNoteChange={vi.fn()}
      />
    )

    expect(screen.getByText("Instructions")).toBeTruthy()
    expect(
      screen.getByPlaceholderText(
        "Tell the coding agent what to change about this element...",
      ),
    ).toBeTruthy()
  })

  it("uses the same label styling as other fields", () => {
    render(
      <StyleEditor
        styles={createStyles()}
        elementId="heading"
        editedProps={new Map()}
        note=""
        elementLabel="h1.hero"
        onStyleEdit={vi.fn()}
        onTextEdit={vi.fn()}
        onUndo={vi.fn()}
        onNoteChange={vi.fn()}
      />
    )

    expect(screen.getByText("Instructions").className).toBe(
      "flex items-center gap-1 text-xs text-slate-900 dark:text-slate-400",
    )
  })

  it("clears instructions when reverting free-form text", () => {
    const onNoteChange = vi.fn()
    render(
      <StyleEditor
        styles={createStyles()}
        elementId="heading"
        editedProps={new Map()}
        note="Make the headline friendlier"
        elementLabel="h1.hero"
        onStyleEdit={vi.fn()}
        onTextEdit={vi.fn()}
        onUndo={vi.fn()}
        onNoteChange={onNoteChange}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Revert instructions" }))

    expect(onNoteChange).toHaveBeenCalledWith("heading", "")
  })
})
