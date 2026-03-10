# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Palette is a design feedback tool that bridges a Chrome extension with AI coding agents via MCP (Model Context Protocol). Users visually select and edit elements on a webpage, then send structured feedback to a coding agent.

## Monorepo Structure

- **`ext/`** — Chrome extension (Plasmo + React + Tailwind)
- **`mcp/`** — MCP server (Node.js + Socket.IO)

## Commands

### Extension (`ext/`)
```bash
npm run dev          # Plasmo dev server with hot reload
npm run dev:demo     # Vite demo app (standalone UI testing)
npm run build        # Production build
npm run package      # Package for Chrome Web Store
```
Load the dev extension from `ext/build/chrome-mv3-dev` in Chrome.

### MCP Server (`mcp/`)
```bash
npm run build        # Compile TypeScript to dist/
npm start            # Run MCP server (stdio transport)
node test-e2e.mjs    # End-to-end test (spawns server, validates Socket.IO + MCP flow)
```

## Architecture

### Data Flow
1. Extension content script (`contents/palette.ts`) intercepts DOM clicks, extracts element hierarchy and computed styles
2. Background script (`background.ts`) enriches elements with React component names via Fiber inspection (`__reactFiber$`)
3. Sidepanel UI (`components/SidePanel.tsx`) displays hierarchy, allows style/text/icon editing, tracks changes
4. On "Send to Coding Agent", sidepanel sends feedback via Socket.IO to the MCP server
5. MCP server (`mcp/src/index.ts`) returns feedback to the agent through the `get_design_feedback` tool

### Extension ↔ MCP Connection
- MCP server binds Socket.IO to an OS-assigned port and registers session info in `~/.palette/sessions/`
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
- Import sorting: builtins → third-party → `@plasmo` → `@plasmohq` → `~/` aliases → relative

### TypeScript
- Strict mode in both packages
- `ext/` uses `~` path alias mapping to project root
- `mcp/` targets ES2022 with NodeNext module resolution
