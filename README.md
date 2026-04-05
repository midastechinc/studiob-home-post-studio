# Studio B Home — Post Studio

Standalone app for drafting **luxury Instagram-style carousels**: supplier list, product URL import (via serverless fetch), long-form caption, and a **4:5 preview** (3–7 slides). This repository contains **only** this application.

## Run locally (UI)

```bash
cd studiob-home-post-studio
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5174`).

## Product import (`/api/fetch-url`)

The browser cannot call supplier sites directly (CORS). This repo includes **`api/fetch-url.js`** for **Vercel**.

- **Option A — Vercel CLI:** from this directory run `npx vercel dev` so `http://localhost:3000` (or the port shown) serves both the Vite proxy and API. Link Vite to that port if needed, or deploy and use the preview URL.
- **Option B — Deploy** this repo to Vercel; the production URL will serve `GET /api/fetch-url?url=…` with an allowlist (Henge, Dedon, Walter Knoll domains).

Plain `npm run dev` still lets you edit suppliers, caption, and preview (using the logo as a placeholder image until import works).

## New GitHub repository

Create an empty repo (e.g. `studiob-home-post-studio`), then:

```bash
git remote add origin https://github.com/YOUR_ORG/studiob-home-post-studio.git
git branch -M main
git push -u origin main
```

## License

Proprietary — Studio B Home / Midas Tech unless otherwise agreed.
