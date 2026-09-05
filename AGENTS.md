# AGENTS.md

## Purpose

This file gives future Codex sessions the project context needed to work quickly without rediscovering the app structure.

Figy is a local FigJam-style whiteboard. Preserve the direct, usable canvas experience. Do not turn it into a landing page or framework rewrite unless the user explicitly asks.

## Project Layout

```text
index.html
api/chat.js
server.js
package.json
vercel.json

assets/
  Toolbar and cursor SVG assets.

src/js/
  aiClient.js
    Shared browser helper for AI requests.
  board.js
    Main whiteboard logic: tools, objects, drawing, selection, dragging, zoom, pan, undo/redo.
  chat.js
    Floating AI chatbot UI.

src/styles/
  main.css
    All app styling.

src/server/
  chat.js
    Hugging Face router, legacy Hugging Face endpoint, optional LangChain path.
  env.js
    Minimal .env parser.
  http.js
    JSON helpers and CORS headers.
  static.js
    Static file server with private-file blocking.
```

## Run Commands

Install dependencies only if package dependencies are added later:

```bash
npm install
```

Start local app and AI server:

```bash
npm start
```

Install Mac login autostart for the local AI server:

```bash
npm run autostart:install
```

Remove Mac login autostart:

```bash
npm run autostart:uninstall
```

Default app URL:

```text
http://127.0.0.1:4317
```

Build static output for Vercel:

```bash
npm run build
```

## Vercel Hosting

This project is now Vercel-ready.

- Vercel builds static output into `dist/` using `scripts/build-vercel.js`.
- `vercel.json` sets `outputDirectory` to `dist`.
- Hosted AI calls use `api/chat.js`.
- `api/chat.js` reuses `src/server/chat.js`.
- Vercel env vars are read from `process.env`.
- Local `.env` is only for `server.js` on the user's machine.

Required Vercel Environment Variables:

```text
HUGGINGFACE_API_KEY
```

Do not expose or print secrets. If a token appears in output, recommend rotating it before deployment.

Model, prompt, LangChain mode, max token count, port, and host are code defaults. Do not ask the user to set those in Vercel unless they explicitly want deployment-time overrides.
Do not add LangChain packages by default. The optional dynamic import path can stay, but Vercel deploys should not install LangChain unless the user explicitly wants that mode.

## Validation Commands

Run these after JavaScript/server edits:

```bash
node --check src/js/board.js
node --check src/js/chat.js
node --check src/js/aiClient.js
node --check server.js
node --check src/server/chat.js
node --check src/server/env.js
node --check src/server/http.js
node --check src/server/static.js
node --check api/chat.js
```

## AI Setup

Secrets live in `.env`. Never print or expose `HUGGINGFACE_API_KEY`.

Current expected env keys:

```text
HUGGINGFACE_API_KEY=
```

The browser calls AI through `window.FigyAI.requestAIReply()` from `src/js/aiClient.js`.

In production, `src/js/aiClient.js` only calls `/api/chat`. On local static previews, it can also fall back to `http://127.0.0.1:4317/api/chat`.

`src/server/chat.js` uses the Hugging Face OpenAI-compatible router for `openai/gpt-oss-*` models. It falls back to the legacy Hugging Face inference endpoint for other models unless `HUGGINGFACE_API_MODE` is set.

The server must remain bound to `127.0.0.1` by default. Do not expose `.env`, dotfiles, or `node_modules`.

## UI Behavior To Preserve

- First screen is the board itself.
- Bottom toolbar contains Select, Pan, Sticky, Text, Pencil, Eraser, and Shapes.
- Select mode should select, move, delete, copy, paste, and drag-select objects.
- Pan mode uses hand/grab behavior.
- Sticky selection shows color dots, connector handles, and the AI write button.
- Sticky AI opens a small popover near the sticky and writes directly into `.sticky-content`.
- Assistant chat replies can be converted into board objects with `Add stickies`, `Add text`, and `Add heading`.
- Pencil tool has color and width controls.
- Finished pencil strokes become selectable `.stroke-item` objects.
- Shapes are resizable and can be non-uniform unless Shift is held while drawing/resizing.
- Zoom range is 2% to 200%.
- The background grid density adapts when zooming.
- Dark/light mode uses the sun/moon switch.

## Coding Preferences

- Keep this as a small plain HTML/CSS/JS app unless the user asks for a framework.
- Prefer focused additions to `src/js/board.js`; split modules only when a feature grows independent, like chat or AI client.
- Use existing CSS tokens in `:root` and `body.dark`.
- Keep UI compact and FigJam-like.
- Use existing assets from `assets/` before adding new icons.
- Avoid exposing secrets in frontend code or docs.
- After moving assets, remember CSS URLs are relative to `src/styles/main.css`.

## Common Gotchas

- If AI says “server offline,” start `npm start` and refresh the page.
- If the user wants the AI server to start automatically on Mac, use the `autostart:install` script. It creates a `launchd` service named `com.figy.ai-server`.
- Static preview servers do not provide `/api/chat`; the browser fallback uses `http://127.0.0.1:4317/api/chat`.
- If toolbar icons break after file moves, check paths in `index.html` and `src/styles/main.css`.
- For selected pencil drawings, interaction is on `.stroke-item`, not the SVG polyline itself.
- Undo/redo depends on `serializeBoard()` and `restoreBoard()`; update both when adding a new object type.
