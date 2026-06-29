# Hosting Fix For GitHub Pages / Vercel

## Why the screenshot shows `.gitignore`

If the browser shows:

```text
node_modules/ build/ dist/ coverage/ .DS_Store *.log .env* !.env.example
```

then GitHub Pages is serving the wrong file as the website entry page. That text is the `.gitignore` content, not the app.

Check these:

1. The repository must contain the real `index.html` from this project.
2. Do not rename `.gitignore` to `index.html`.
3. GitHub Pages must point to the correct branch/folder.
4. If you use a static build, deploy the contents of `dist/`, not random root files.

## Important: GitHub Pages cannot run the full app

GitHub Pages only serves static files. Moyna needs:

- Node/Express server
- `/live` WebSocket route
- server-side Gemini API key
- memory API routes

So GitHub Pages can only show a static preview. Voice/live AI will not work there.

## Important: Vercel is not recommended for full voice mode

Vercel serverless functions are not a good fit for long-running Gemini Live WebSocket sessions. The UI may deploy, but `/live` voice connection can fail.

## Best Hosting

Use one of these:

- AI Studio / Cloud Run
- Render
- Railway
- VPS / Docker

## Render Quick Deploy

1. Push this project to GitHub.
2. Create a new Render Web Service.
3. Use:
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
4. Add secrets:
   - `GEMINI_API_KEY`
   - optional `GEMINI_API_KEYS`

## Railway Quick Deploy

1. Push this project to GitHub.
2. Create a Railway project from the repo.
3. Add variables:
   - `GEMINI_API_KEY`
   - optional `GEMINI_API_KEYS`
4. Railway reads `railway.json`.

## Docker Deploy

```bash
docker build -t moyna-ai .
docker run -p 3000:3000 -e GEMINI_API_KEY=your_key moyna-ai
```
