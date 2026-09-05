# Figy

Figy is a lightweight FigJam-style whiteboard built with plain HTML, CSS, JavaScript, and a small local Node server for AI features.

## What It Can Do

- Create and edit sticky notes
- Change sticky note colors
- Use AI to write directly inside a selected sticky
- Add text with font and size controls
- Draw with pencil, including color and width controls
- Select, move, copy, paste, delete, and erase objects
- Add shapes with color controls
- Pan and zoom the board
- Switch between light and dark mode
- Use a small AI chatbot panel

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
    chat.js          Hugging Face chat logic, with an optional LangChain path
    env.js           .env loader
    http.js          JSON request/response helpers
    static.js        Static file serving

index.html           Main app page
api/chat.js          Vercel API route for hosted AI chat
server.js            Local Node server entry point
package.json         App scripts and dependencies
.env                 Local private config, not committed
.env.example         Example AI config
vercel.json          Vercel function settings
```

## Setup

Install dependencies, if package dependencies are added later:

```bash
npm install
```

Create or update `.env`:

```text
HUGGINGFACE_API_KEY=your_hugging_face_token_here
```

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

Before deploying, create a fresh Hugging Face token and use that on Vercel.

1. Push this folder to a GitHub repository.
2. Import the repository in Vercel.
3. In Vercel, open Project Settings, then Environment Variables.
4. Add this variable for Production and Preview:

```text
HUGGINGFACE_API_KEY=your_hugging_face_token_here
```

5. Deploy the project.

On Vercel, the app uses `/api/chat`. The local `server.js` is only for running Figy on your computer.

The model and chat settings are normal code defaults, so you can change or add models later without editing Vercel environment variables.

## AI Notes

The Hugging Face token is read by the local server from `.env`. It is not placed in browser JavaScript.

On Vercel, the Hugging Face token is read from Vercel Environment Variables. Do not upload `.env`.

Default AI settings live in `src/server/chat.js`:

```text
Model: openai/gpt-oss-120b
Max tokens: 700
LangChain: optional and off by default
```

The server blocks private files like `.env` from being served in the browser.

The browser AI client tries:

1. `/api/chat`
2. `http://127.0.0.1:4317/api/chat`

This lets AI still work if the page is opened from a local static preview, as long as the Figy server is running.

## Validation

Useful quick checks:

```bash
node --check src/js/board.js
node --check src/js/chat.js
node --check src/js/aiClient.js
node --check server.js
node --check src/server/chat.js
node --check api/chat.js
```
