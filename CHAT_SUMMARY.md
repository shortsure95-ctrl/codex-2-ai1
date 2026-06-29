# Chat Summary And Upgrade Notes

## User Goal

Ratan wanted the AI assistant package to become smaller, more unique, and more powerful while keeping voice control, browser control, text commands, memory, welcome messages, and optional PC control.

## What Changed

- The final package keeps the three animation videos:
  - `assets/idle.mp4`
  - `assets/thinking.mp4`
  - `assets/talking.mp4`
- The package became much smaller because the bundled 17 MB VRM avatar, the unused GLB model, and duplicate `.aistudio` cache videos are excluded from the final zip.
- The 3D mode now starts with a lightweight procedural avatar by default.
- Users can still upload `.vrm`, `.glb`, `.gltf`, or `.obj` avatars from the UI.
- API keys are not hardcoded. Use AI Studio Secrets:
  - `GEMINI_API_KEY`
  - optional `GEMINI_API_KEYS` for backup keys
- Local PC/browser control is handled through `local-agent.js`.
- The local bridge supports optional token protection with `MOYNA_AGENT_TOKEN`.
- Browser control was strengthened with:
  - open
  - search
  - click
  - click visible text
  - type
  - scroll
  - mouse move
  - keyboard press
  - tab actions
  - media controls
  - page readback
  - find text on page
- Windows desktop control through the local bridge supports:
  - mouse move
  - click
  - type/paste
  - hotkey

## Rebuild The Small Zip

From the project root:

```powershell
npm run package:lite
```

The script excludes `node_modules`, `dist`, duplicate AI Studio cache assets, and heavy default model files.

## Important Limits

A hosted AI Studio web app cannot directly control the whole PC by itself because browser security blocks that. Real browser/desktop control requires running `local-agent.js` on the user's own PC.
