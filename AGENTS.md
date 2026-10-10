# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Handle is a design feedback tool that bridges a Chrome extension with AI coding agents via MCP (Model Context Protocol). Users visually select and edit elements on a webpage, then send structured feedback to a coding agent.

## Monorepo Structure

- **`ext/`** — Chrome extension (WXT + React + Tailwind)
- **`mcp/`** — MCP server (Node.js + Socket.IO)

## Commands

### Extension (`ext/`)
```bash
npm run dev          # WXT dev server with hot reload
npm run dev:demo     # Vite demo app (standalone UI testing)
npm run build        # Production build
npm run zip          # Package for Chrome Web Store
```
Load the dev extension from `ext/.output/chrome-mv3` in Chrome.

### Tests (run from `handle/`)
```bash
npx vitest run                    # Run all unit tests (shared + ext)
npx vitest run shared/            # Run shared/ tests only
npx vitest run --watch            # Watch mode
```

Vitest config at `vitest.config.ts` — jsdom environment, includes `shared/src/**/*.test.{ts,tsx}` and `ext/__tests__/**/*.test.{ts,tsx}`.

Key test files:
- `shared/src/utils/color.test.ts` — color parsing, conversion, opacity helpers
- `shared/src/utils/dom.test.ts` — buildDomTree, selectorPath, detectComponent, hasFrameworkMarkers, isElementVisible
- `shared/src/hooks/useEditTracker.test.ts` — edit tracking hook (recordEdit, changeCount, feedback description)

### MCP Server (`mcp/`)
```bash
npm run build        # Compile TypeScript to dist/
npm start            # Run MCP server (stdio transport)
node test-e2e.mjs    # End-to-end test (spawns server, validates Socket.IO + MCP flow)
```

## Architecture

### Data Flow
1. Extension content script (`entrypoints/contents/handle.ts`) intercepts DOM clicks, extracts element hierarchy and computed styles
2. Background script (`entrypoints/background.ts`) enriches elements with React component names via Fiber inspection (`__reactFiber$`)
3. Sidepanel UI (`components/SidePanel.tsx`) displays hierarchy, allows style/text/icon editing, tracks changes
4. On "Send to Coding Agent", sidepanel sends feedback via Socket.IO to the MCP server
5. MCP server (`mcp/src/index.ts`) returns feedback to the agent through the `get_design_feedback` tool

### Extension ↔ MCP Connection
- MCP server binds Socket.IO to an OS-assigned port and registers session info in `~/.handle/sessions/`
- A discovery HTTP server runs on well-known port **58932** (`GET /api/sessions`)
- Extension polls discovery endpoint every 3s to find active sessions, then connects with session ID auth

### Key Extension Components
- **SidePanel** — Main container; manages Socket.IO connection, element hierarchy state, and edit tracking
- **StyleEditor** — Multi-section property editor (Layout, Appearance, Typography, Content)
- **ElementRow** — Expandable hierarchy display with tag/id/class/component info
- **SendBar** — Session selector and feedback submission
- **IconPicker** — Lucide icon search and selection

## Code Style

### Prettier (ext/)
- No semicolons, double quotes, 2-space indent, 80 char width
- Import sorting: builtins → third-party → `~/` aliases → relative

### TypeScript
- Strict mode in both packages
- `ext/` uses `~` path alias mapping to project root
- `mcp/` targets ES2022 with NodeNext module resolution

## Cursor Cloud specific instructions

- Handle is checked out at `/agent/repos/handle`. The sibling Tonkotsu repo (`miso`) is at `/agent/repos/miso`.
- Install from the Handle root with `npm ci`. The root lockfile covers `ext/`, `shared/`, and `mcp/`.
- `npx vitest run` runs the unit tests. Assertions pass on the default image. The process can still exit non-zero because jsdom has no `chrome.storage` and SidePanel's review-prompt effect rejects.
- Side panel demo, without loading the Chrome extension: from `ext/`, run `npm run dev:demo -- --host 0.0.0.0 --port 5173` and open `http://localhost:5173/`. The cloud environment `start` script launches this server.
- MCP end-to-end check: from `mcp/`, run `npm run build` and then `node test-e2e.mjs`.
- Extension bundle: from `ext/`, run `npm run build`. Unpacked output is `ext/.output/chrome-mv3`.
