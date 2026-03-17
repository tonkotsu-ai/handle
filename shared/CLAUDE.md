# shared/ — `@handle-ai/handle-shared`

Shared package consumed by two sibling projects:

- **`ext/`** (Chrome extension) — `"@handle-ai/handle-shared": "file:../shared"` via npm workspaces
- **`handle-app/`** (Electron desktop app at `../handle-app`) — `"@handle-ai/handle-shared": "file:../handle/shared"`

## Structure

```
src/
├── types.ts              # Shared type definitions (ElementId, StyleData, EditEntry, etc.)
├── utils/
│   ├── color.ts          # Color parsing/conversion (hex, rgba, oklch)
│   └── dom.ts            # DOM visibility helpers
├── components/
│   ├── ColorPicker.tsx   # Color swatch + input editor
│   ├── IconPicker.tsx    # Lucide icon search/selection
│   ├── StyleEditor.tsx   # Multi-section property editor (Layout, Appearance, Typography, Content)
│   └── ElementRow.tsx    # Expandable element hierarchy row
├── hooks/
│   └── useEditTracker.ts # Tracks style/text/icon edits for diff generation
└── index.ts              # Barrel exports
```

## String-template content script pattern

`handle-app` injects a content script into its Electron webview as a **string** via `executeJavaScript()`. This means it cannot use TypeScript imports at runtime. To share DOM logic with it:

1. Write the canonical typed implementation in `utils/` (e.g., `dom.ts`)
2. Also export a **plain JS string constant** (e.g., `visibleElementAtPointSnippet`) containing the same logic
3. `handle-app` imports the string constant and interpolates it into its content script template

This keeps a single source of truth while supporting the injection constraint.

## No build step

This package has no build script. Consumers compile it directly from `src/index.ts` via their own bundlers (Plasmo for ext/, Vite for handle-app).
