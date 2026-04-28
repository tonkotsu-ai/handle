import React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import SidePanel from "../components/SidePanel"

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => ({
    connected: false,
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

vi.mock("../lib/statsig", () => ({
  AnalyticEvent: {
    SidepanelOpened: "sidepanel_opened",
    SidepanelClosed: "sidepanel_closed",
  },
  initStatsig: vi.fn(),
  logEvent: vi.fn(),
}))

vi.mock("@handle-ai/handle-shared", async () => {
  const actual = await vi.importActual<typeof import("@handle-ai/handle-shared")>(
    "@handle-ai/handle-shared",
  )

  return {
    ...actual,
    ElementRow: () => <div data-testid="element-row" />,
    StyleEditor: ({ editedProps }: { editedProps: Map<string, unknown> }) => (
      <div data-testid="edited-props">
        {JSON.stringify(Array.from(editedProps.entries()))}
      </div>
    ),
    getIconSvgChildren: vi.fn(() => ""),
  }
})

type RuntimeListener = (message: any) => void | Promise<void>

const listeners: RuntimeListener[] = []
const sendMessage = vi.fn()

function emitRuntimeMessage(message: any) {
  for (const listener of listeners) {
    listener(message)
  }
}

beforeEach(() => {
  listeners.length = 0
  sendMessage.mockReset()
  window.history.replaceState(null, "", "/?tabId=123")

  vi.stubGlobal("chrome", {
    runtime: {
      connect: vi.fn(() => ({ disconnect: vi.fn() })),
      onMessage: {
        addListener: vi.fn((listener: RuntimeListener) => {
          listeners.push(listener)
        }),
        removeListener: vi.fn((listener: RuntimeListener) => {
          const index = listeners.indexOf(listener)
          if (index >= 0) listeners.splice(index, 1)
        }),
      },
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([{ id: 123 }])),
      get: vi.fn(() => Promise.resolve({ url: "https://example.com" })),
      sendMessage,
    },
  })

  sendMessage.mockImplementation((_tabId: number, message: any) => {
    if (message.type === "get-styles") {
      return Promise.resolve({
        styles: {
          fontFamily: "Inter",
          fontWeight: "400",
          fontSize: "16px",
          color: "rgb(0, 0, 0)",
          padding: "0px",
          margin: "0px",
          display: "block",
          borderRadius: "0px",
          opacity: "1",
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderColor: "rgba(0, 0, 0, 0)",
          borderWidth: "0px",
          borderStyle: "none",
          textContent: "Original text",
        },
        selectorPath: "body > h1",
      })
    }
    if (message.type === "get-page-tokens" || message.type === "get-page-colors") {
      return Promise.resolve([])
    }
    return Promise.resolve()
  })
})

describe("SidePanel inline edit commits", () => {
  it("records inline text edits sent by the content script", async () => {
    render(<SidePanel />)

    await waitFor(() => expect(listeners.length).toBeGreaterThan(0))

    await act(async () => {
      emitRuntimeMessage({
        type: "element-tree",
        tabId: 123,
        tree: {
          nodeId: "root",
          tag: "body",
          id: "",
          classes: "",
          component: null,
          childCount: 1,
          selectorPath: "body",
          children: [
            {
              nodeId: "heading",
              tag: "h1",
              id: "",
              classes: "",
              component: "Hero",
              childCount: 0,
              selectorPath: "body > h1",
              children: [],
            },
          ],
        },
        selectedNodeId: "heading",
        selectedPath: ["root", "heading"],
      })
    })

    await screen.findByTestId("edited-props")

    await act(async () => {
      emitRuntimeMessage({
        type: "inline-edit-commit",
        tabId: 123,
        nodeId: "heading",
        selectorPath: "body > h1",
        original: "Original text",
        value: "Updated text",
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId("edited-props").textContent).toContain(
        "textContent",
      )
      expect(screen.getByTestId("edited-props").textContent).toContain(
        "Updated text",
      )
    })
  })
})
