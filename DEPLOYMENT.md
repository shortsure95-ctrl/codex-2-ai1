# Deployment Guide

## AI Studio

1. Import the zip into AI Studio.
2. Open the app Secrets/Settings panel.
3. Add `GEMINI_API_KEY`.
4. Optional: add `GEMINI_API_KEYS` with comma-separated backup keys.
5. Run or deploy from AI Studio.

Do not paste real keys into source files. Keep them in Secrets.

## Local Development

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Edit `.env.local` and set `GEMINI_API_KEY`.

## Production Node Hosting

Use a stateful Node.js host because the Gemini Live session uses WebSockets.

Recommended options:

- AI Studio / Cloud Run
- Railway
- Render
- VPS or Docker

Do not use GitHub Pages for the full app. It cannot run Node, `/live` WebSockets, or server-side Gemini secrets. Vercel is also not recommended for full voice mode because long-running WebSockets are not a good fit for serverless hosting.

Build and start:

```bash
npm install
npm run build
npm start
```

Required environment:

```env
GEMINI_API_KEY=your_primary_key
GEMINI_API_KEYS=optional_backup_key_1,optional_backup_key_2
NODE_ENV=production
```

This project includes `render.yaml` for Render, `railway.json` for Railway, `Dockerfile` for Docker/VPS, and `HOSTING_FIX.md` for GitHub Pages/Vercel troubleshooting.

## Local Browser And Desktop Bridge

The hosted app cannot directly control the user's whole PC because browsers sandbox web pages. To give Moyna real local browser control and optional Windows mouse/keyboard actions, run the local bridge on the PC:

```powershell
npm install playwright express cors
npx playwright install chromium
$env:MOYNA_AGENT_TOKEN="choose-a-token"; node local-agent.js
```

Then paste the same token into Browser Agent > Local Driver Bridge.

The bridge listens only on `127.0.0.1:3001`.

Extra browser tools available through the bridge:

- `browserReadPage`
- `browserFindText`
- `browserClickText`
- `browserMouseMove`
- `browserKeyPress`

## Package Size

This version removes the large bundled default VRM model and starts with a procedural 3D avatar. Users can still upload `.vrm`, `.glb`, `.gltf`, or `.obj` avatars from the UI.

To regenerate the lightweight zip:

```powershell
npm run package:lite
```
