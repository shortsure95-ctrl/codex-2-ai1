# Moyna Ratan AI Assistant

Voice-first Gemini Live assistant with memory, screen/camera context, browser control, a lighter procedural 3D avatar, and an optional local desktop bridge.

## Run Locally

1. Install Node.js.
2. Install dependencies:
   `npm install`
3. Create `.env.local` from `.env.example`.
4. Add `GEMINI_API_KEY` in `.env.local` or in AI Studio Secrets.
5. Run:
   `npm run dev`

## AI Studio Import

Import this zip into AI Studio, then set these Secrets:

- `GEMINI_API_KEY`: primary Gemini API key.
- `GEMINI_API_KEYS`: optional comma-separated backup keys.

Do not hardcode API keys in source files. Keep them in AI Studio Secrets or `.env.local`.

## Hosting Warning

GitHub Pages cannot run the full app because Moyna needs a Node server and a `/live` WebSocket connection. Vercel may deploy the frontend, but it is not recommended for full Gemini Live voice mode. Use AI Studio/Cloud Run, Render, Railway, or Docker/VPS.

If GitHub Pages shows `.gitignore` text, the wrong file was deployed as the page entry. See `HOSTING_FIX.md`.

## Real Browser / PC Control

Hosted web apps cannot directly control your whole PC by themselves. For real local control, run the bridge on your own Windows PC:

```powershell
npm install playwright express cors
npx playwright install chromium
$env:MOYNA_AGENT_TOKEN="choose-a-token"; node local-agent.js
```

Then open Moyna, go to Browser Agent > Local Driver Bridge, paste the same token, and voice/text commands can route through the local bridge.

Supported bridge actions include browser open/search/click/type/scroll/tab control, browser mouse movement, browser key presses, and optional Windows desktop mouse/type/hotkey actions.

The bridge can also read the active page, find text on the page, and click visible text labels. This makes voice browsing more reliable because Moyna can inspect what loaded before answering.

## Size Note

The original package was large because of a default 17 MB VRM avatar. This version uses the procedural 3D avatar by default and still lets you upload `.vrm`, `.glb`, `.gltf`, or `.obj` files later from the UI.

The animation videos are still included: `idle.mp4`, `thinking.mp4`, and `talking.mp4`.

## Rebuild Clean Zip

```powershell
npm run package:lite
```

This creates a small import-ready zip while excluding `node_modules`, `dist`, duplicate AI Studio cache videos, and heavy default avatar model files.
