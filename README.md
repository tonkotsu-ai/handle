# Handle

**Refine UI Directly in Your Browser Instead of Describing it With Prompts**

Handle bridges the gap between visual design and AI coding agents. Built for frontend devs, design engineers, and UX designers. Instead of describing UI changes in words, just point directly at elements in the browser and edit — and your agent receives structured, actionable feedback it can act on immediately.

## How It Works

1. Create UI with your coding agent, then type `/handle`
2. Refine directly inside Chrome using the extension
4. Your coding agent lands your changes into code

No more "on the landing page, in the testimonials unit, in the bottom right corner, make the button a bit more to the right" — just point and do it.

## Getting Started

### For users

**1. Install the MCP server**

Run the setup command to auto-configure your coding agent:

```bash
npx handle-ext@latest init
```

Supported agents: **Claude Code**, **Codex**, **Cursor**, **GitHub Copilot**, **Windsurf**, **Gemini CLI**, **Rovo Dev**

Restart your agent after setup to activate Handle.

**2. Install the Chrome extension**

Download the [Handle extension](https://chromewebstore.google.com/detail/pfcfpjololfdopoglgplmijaohidmopj) from the Chrome Web Store and pin it to your toolbar.

**3. Use it**

Type `/handle` in your coding agent. Chrome will launch. Click on the Handle extension button to open the side panel. Click any element to inspect and annotate it, then send your feedback.

---

### For contributors

This is a monorepo with three packages:

```
ext/      Chrome extension (WXT + React + Tailwind)
mcp/      MCP server (Node.js + Socket.IO)
shared/   Shared components and utilities
```

**Install dependencies** (from the root):

```bash
npm install
```

**Run the extension in dev mode:**

```bash
cd ext
npm run dev
```

Then load `ext/.output/chrome-mv3` as an unpacked extension in Chrome (`chrome://extensions` → "Load unpacked").

**Run the MCP server:**

```bash
cd mcp
npm run build
npm start
```

Or wire it up via `npx handle-ext setup` as described above.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines on submitting changes.

## Architecture

Handle has three moving parts:

- **Chrome extension** — content script that captures DOM structure, styles, and React component names; side panel UI for annotating changes
- **MCP server** — runs on stdio, spawned by your coding agent; exposes the `get_design_feedback` tool and starts a local Socket.IO server for extension communication
- **Discovery server** — a lightweight HTTP server on port **58932** that lets the extension find active MCP sessions

## License

MIT — see [`LICENSE`](LICENSE)
