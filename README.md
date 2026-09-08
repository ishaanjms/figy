# Figy

## Workspace and Flow Improvements

- The board and chat save locally and reopen on refresh. Local saving is device/browser specific, not cloud sync. Group/Ungroup, board-file export/import, and manual recovery controls have been removed from the toolbar.
- AI flow requests open a visual preview with zoom, editable assumptions, Simplify, and Add exception paths. Insert is explicit and undoable.
- Generated diagrams use ELK layout with separate ports for each connection. There is no four-connection cap and no silently dropped branch. Manual connections remain unrestricted.
- Connector labels belong to edges, follow movement, and disappear with the edge. Their text and routing survive saving and undo.
- Board actions include search, fit selection/board, alignment, copying multiple selected objects with their internal connections, click-to-connect for two selected objects, and downloadable HTML review pages. Arrow keys move selected objects; Shift moves by 10 pixels. Focus an object and use Shift+Enter to extend selection without dragging.
- The chat checkbox controls whether selected board objects are included in requests.
- `npm install` installs ELK and Lucide. Startup and build copy browser bundles into ignored `assets/vendor/`; Vercel builds include shared graph validation.

### AI Usage Controls

AI routes enforce an origin check, input size limit, 10 requests per client per minute, and 100 requests per service instance per day. Upstream requests have timeouts. `AI_DISABLED=true` pauses AI requests.

For a shared quota across Vercel instances, configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from your Redis service. Without these, counters are in memory and reset on cold starts; they are not a deployment-wide spending guarantee. Origin checks are not authentication. Use deployment access protection for a private pilot, and set provider-side spending limits for a public launch. No Redis account or deployment protection was created automatically.

### Evaluation

Run `npm test` for graph and usage regression checks. `tests/browser.cjs` runs browser checks with Playwright and Chrome against `http://127.0.0.1:4318`; override with `FIGY_TEST_URL` and optionally `PLAYWRIGHT_PATH`. It uses mocked AI replies and does not spend model credits. See `docs/product-evaluation.md` for the proposed usability study and case-study outline. User research has not yet been conducted.

Figy is a lightweight FigJam-style whiteboard built with plain HTML, CSS, JavaScript, and a small local Node server for AI features.

## What It Can Do

- Create and edit sticky notes
- Change sticky note colors
- Use AI to write directly inside a selected sticky
- Turn AI chat replies into sticky notes, text blocks, or headings on the canvas
- Add text with font and size controls
- Draw with pencil, including color and width controls
- Select, move, copy, paste, delete, and erase objects
- Add shapes with color controls
- Pan and zoom the board
- Switch between light and dark mode
- Use a small AI chatbot panel
- Switch between supported Gemini and Hugging Face chat models from the AI settings

## Project Structure

```text
assets/
  SVG icons and toolbar assets

src/
  js/
    aiClient.js      Shared browser AI request helper
    board.js         Main whiteboard tools and board interactions
    chat.js          Floating chatbot panel
  styles/
    main.css         App styling
  server/
    chat.js          Gemini and Hugging Face chat logic, with an optional LangChain path
    flowchart.js     Three-agent flowchart request handler
    agents/
      flowchartOrchestrator.js  Runs Intent, Process, and Graph agents in sequence
      flowchartPrompts.js       Agent roles, prompts, and JSON contracts
      flowchartState.js         Structured handoffs, normalization, and fallbacks
    env.js           .env loader
    http.js          JSON request/response helpers
    static.js        Static file serving

index.html           Main app page
api/chat.js          Vercel API route for hosted AI chat
api/flowchart.js     Vercel API route for agentic flowchart generation
server.js            Local Node server entry point
scripts/build-vercel.js  Copies static files into dist for Vercel
package.json         App scripts and dependencies
.env                 Local private config, not committed
.env.example         Example AI config
vercel.json          Vercel build and function settings
```

## Setup

Install dependencies, if package dependencies are added later:

```bash
npm install
```

Create or update `.env`:

```text
GEMINI_API_KEY=your_gemini_key_here
```

`GOOGLE_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` also work if you already use one of those names.

Start the app:

```bash
npm start
```

Open:

```text
http://127.0.0.1:4317
```

## Start AI Automatically On Mac

To make the Figy AI server start automatically when you log in:

```bash
npm run autostart:install
```

After that, the AI features should be available after login without manually running `npm start`.

To remove the login service:

```bash
npm run autostart:uninstall
```

Logs are written to `logs/` if you need to debug the background server.

## Deploy To Vercel

Before deploying, create a fresh Gemini key and use that on Vercel.

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. In Vercel, open Project Settings, then Environment Variables.
4. Add this variable for Production and Preview:

```text
GEMINI_API_KEY=your_gemini_key_here
```

In Vercel, put only `GEMINI_API_KEY` in the key/name field and only the token value in the value field. After saving the variable, redeploy the project because existing deployments do not automatically pick up new environment variables.

After deployment, open this URL to confirm the function can see the key without exposing it:

```text
https://your-vercel-domain.vercel.app/api/chat
```

You should see `"hasGeminiKey": true`. If it is `false`, the variable was added to the wrong Vercel project/environment or the deployment was not rebuilt after adding it.

5. Deploy the project.

On Vercel, the app uses `/api/chat` for conversation and `/api/flowchart` for the three-agent flowchart workflow. The local `server.js` exposes both routes when running Figy on your computer.

The app includes a small AI model selector in the chatbot header. Only the private API key needs to be stored as a Vercel environment variable.

Vercel runs `npm run build`, which copies the static app into `dist/`. The project is configured to serve `dist/` as the website output.

## AI Notes

The Gemini key is read by the local server from `.env`. It is not placed in browser JavaScript.

On Vercel, the Gemini key is read from Vercel Environment Variables. Do not upload `.env`.

Default AI settings live in `src/server/chat.js`:

```text
Default model: gemini-2.5-flash
Available models: gemini-2.5-flash, gemini-2.0-flash, openai/gpt-oss-120b, Qwen/Qwen3.8-2.4T-A95B, deepseek-ai/DeepSeek-V4-Pro
Max tokens: 1200
LangChain: optional and off by default
```

If `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` is present and `HUGGINGFACE_API_KEY` is missing, Figy automatically uses Gemini. Hugging Face remains available as a fallback provider when configured.

The server blocks private files like `.env` from being served in the browser.

The browser AI client tries:

1. `/api/chat`
2. `http://127.0.0.1:4317/api/chat`

This lets AI still work if the page is opened from a local static preview, as long as the Figy server is running.

Assistant replies in the chat panel show board actions when the response has usable ideas. `Add stickies` creates a clean non-overlapping cluster in the current view, `Add text` places the reply as editable board text, and `Add heading` creates a larger title-style text item.

Flowcharts use three real server-side stages: the Intent Agent defines the goal and scope, the Process Agent creates steps and branches, and the Graph Architect produces board-ready nodes, connections, and layout hints. Each stage receives structured output from the previous stage. Deterministic normalization keeps the workflow usable when a model returns malformed JSON.

## Validation

Useful quick checks:

```bash
node --check src/js/board.js
node --check src/js/chat.js
node --check src/js/aiClient.js
node --check server.js
node --check src/server/chat.js
node --check src/server/flowchart.js
node --check src/server/agents/flowchartOrchestrator.js
node --check src/server/agents/flowchartPrompts.js
node --check src/server/agents/flowchartState.js
node --check api/chat.js
node --check api/flowchart.js
npm run build
```
