# Studio B Home — Post Studio

Standalone app for drafting **luxury Instagram-style carousels**: supplier list, product URL import (via serverless fetch), long-form caption, and a **4:5 preview** (3–7 slides). This repository contains **only** this application.

## Run locally (UI)

```bash
cd studiob-home-post-studio
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5174`).

## Run online (Vercel)

The app and **`/api/fetch-url`** are configured for [Vercel](https://vercel.com) (`vercel.json` + `api/fetch-url.js`). After deploy, open your **`.vercel.app`** URL (or custom domain); product URL import works on that same origin.

### Deploy from this folder (no GitHub required)

1. Install [Node.js 18+](https://nodejs.org) if needed.
2. In the project directory:

   ```bash
   npm install
   npx vercel login
   npx vercel
   ```

   Answer the prompts (link to a Vercel team, project name). The first deploy creates a **preview** URL.

3. Ship to production:

   ```bash
   npx vercel --prod
   ```

   (Equivalent: `npm run deploy`. For a preview deploy only: `npm run deploy:preview`.)

Use the **Production** URL Vercel prints as your live app.

### Deploy from GitHub

1. Push this repository to GitHub (see below).
2. In Vercel: **Add New… → Project → Import** your repo. Leave defaults (Vite is detected; build `npm run build`, output `dist`).
3. Click **Deploy**. Vercel will assign a production URL and rebuild on every push to the connected branch.

## Product import (`/api/fetch-url`)

The browser cannot call supplier sites directly (CORS). This repo includes **`api/fetch-url.js`** for **Vercel**.

- **Local with API:** from this directory run `npx vercel dev` so the dev server serves both the frontend and `GET /api/fetch-url?url=…` (allowlisted hosts: Henge, Dedon, Walter Knoll).
- **Online:** use a Vercel deployment (above); production and preview URLs both expose `/api/fetch-url` on the same host as the UI.

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
