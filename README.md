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

- **Option A — Vercel CLI:** from this directory run `npx vercel dev` (default **http://127.0.0.1:3000**). In a second terminal run **`npm run dev`**; Vite proxies **`/api/*`** to port 3000 so **HTML import** and **image thumbnails** work.
- **Option B — Deploy** this repo to Vercel; production serves `GET /api/fetch-url?url=…` and **`GET /api/image-proxy?url=…`**. Images are proxied server-side with an appropriate **Referer** so supplier CDNs (e.g. Walter Knoll) do not hotlink-block the browser.

Plain `npm run dev` without `vercel dev` will not load remote images (placeholders / broken thumbs) because `/api/image-proxy` is missing.

## Export for Instagram

In the **Preview** section use **Download carousel (1080×1350 PNG)** to save one PNG per slide (feed-optimized 4:5). Images are drawn with the **canvas API** (single `drawImage` at full size) so exports stay sharp — not a DOM screenshot. Use **Download caption (.txt)** for the long caption. On your phone: New post → select the files **in numbered order** → paste the caption.

## Image proxy (`/api/image-proxy`)

Product photos are loaded through this route so **grid + preview** are not blocked by **Referer / hotlink** rules. Allowed hosts include supplier domains, their subdomains, and **known third-party CDNs** (e.g. Walter Knoll uses `d248k8q1c80cf8.cloudfront.net` and `wk-prod-assets.s3.eu-central-1.amazonaws.com` for some assets — your UI may truncate these as `…cloudfront.net/…` or `…amazonaws.com/…`). See `api/allowlist.js` to add more CDN hostnames if a supplier changes infrastructure.

## New GitHub repository

Create an empty repo (e.g. `studiob-home-post-studio`), then:

```bash
git remote add origin https://github.com/YOUR_ORG/studiob-home-post-studio.git
git branch -M main
git push -u origin main
```

## License

Proprietary — Studio B Home / Midas Tech unless otherwise agreed.
