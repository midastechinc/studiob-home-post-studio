import './style.css';

const STORAGE_SUPPLIERS = 'sb-suppliers-v1';
const STORAGE_CAPTION = 'sb-caption-v1';
const STORAGE_SLIDES = 'sb-slide-count-v1';
const STORAGE_EXTRA_IMAGES = 'sb-product-extra-images-v1';

const DEFAULT_SUPPLIERS = [
  { name: 'Henge', url: 'https://www.henge07.com/' },
  { name: 'Dedon', url: 'https://www.dedon.de/' },
  { name: 'Walter Knoll', url: 'https://www.walterknoll.de/en' }
];

const SHOWROOM = {
  lines: ['380 King Street East', 'Toronto, Ontario M5A 1K9', '416-363-2996'],
  hours: [
    'Mon–Thu 9:30–5:30',
    'Fri 9:30–5:00',
    'Sat by appointment',
    'Sun closed'
  ]
};

function loadSuppliers() {
  try {
    const raw = localStorage.getItem(STORAGE_SUPPLIERS);
    if (!raw) {
      const initial = DEFAULT_SUPPLIERS.map((s) => ({ ...s, id: crypto.randomUUID() }));
      saveSuppliers(initial);
      return initial;
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) {
      const initial = DEFAULT_SUPPLIERS.map((s) => ({ ...s, id: crypto.randomUUID() }));
      saveSuppliers(initial);
      return initial;
    }
    return arr;
  } catch {
    const initial = DEFAULT_SUPPLIERS.map((s) => ({ ...s, id: crypto.randomUUID() }));
    saveSuppliers(initial);
    return initial;
  }
}

function saveSuppliers(list) {
  localStorage.setItem(STORAGE_SUPPLIERS, JSON.stringify(list));
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Resolve og:image / twitter:image URLs (protocol-relative, relative, absolute). */
function normalizeImageUrl(raw, pageUrl) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (/^https?:/i.test(u)) return u;
  try {
    return new URL(u, pageUrl).href;
  } catch {
    return '';
  }
}

function dedupeImageUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function isJunkImageUrl(u) {
  return /favicon|sprite|icons?\/|\/icon-|logo-|avatar|gravatar|pixel|spacer|1x1|placeholder|badge-|loading\.|blank\.|apple-touch|ms-icon|og-image-default|social-share|share-icon|payment-|credit-card|trustpilot|facebook\.com|twitter\.com|linkedin\.com|google-analytics|googletagmanager|doubleclick|hotjar|clarity\.ms|data:image/i.test(
    u
  );
}

/** Any string in JSON that looks like a direct image URL (galleries often live in __NEXT_DATA__ etc.). */
function collectImageLikeUrlsFromJson(node, out, depth = 0) {
  if (out.length >= 200 || depth > 120 || node == null) return;
  if (typeof node === 'string') {
    if (!/^https?:\/\//i.test(node)) return;
    if (!/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(node)) return;
    if (isJunkImageUrl(node)) return;
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectImageLikeUrlsFromJson(x, out, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) {
      collectImageLikeUrlsFromJson(v, out, depth + 1);
    }
  }
}

/** Parse inline scripts (not ld+json) as JSON and harvest image URLs. */
function collectImagesFromInlineJsonScripts(doc) {
  const out = [];
  doc.querySelectorAll('script:not([src])').forEach((s) => {
    if ((s.getAttribute('type') || '').includes('ld+json')) return;
    const text = (s.textContent || '').trim();
    if (text.length < 500 || text.length > 3_500_000) return;
    if (!/\.(jpe?g|png|webp|gif)/i.test(text)) return;
    try {
      collectImageLikeUrlsFromJson(JSON.parse(text), out, 0);
    } catch {
      /* not valid JSON — raw HTML scan handles quoted URLs below */
    }
  });
  return out;
}

/** Regex-scan full HTML: galleries are often only inside JS strings in the initial payload. */
function collectImagesFromHtmlString(html, anchorUrl) {
  const re = /https?:\/\/[^\s"'<>\\`]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>\\`#]*)?/gi;
  const hits = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (hits.length > 120) break;
    let u = m[0].replace(/\\u002f/gi, '/').replace(/\\u0026/g, '&');
    u = u.replace(/[,;)}'"]+$/g, '');
    if (isJunkImageUrl(u)) continue;
    hits.push({ u, i: m.index });
  }
  let ogHost = '';
  try {
    ogHost = anchorUrl ? new URL(anchorUrl).hostname : '';
  } catch {
    ogHost = '';
  }
  hits.sort((a, b) => {
    let sa = 0;
    let sb = 0;
    try {
      if (ogHost && new URL(a.u).hostname === ogHost) sa += 10;
      if (ogHost && new URL(b.u).hostname === ogHost) sb += 10;
    } catch {
      /* ignore */
    }
    if (sb !== sa) return sb - sa;
    return a.i - b.i;
  });
  return dedupeImageUrls(hits.map((h) => h.u));
}

function parseExtraImageLines(text) {
  return dedupeImageUrls(
    (text || '')
      .split(/\n/)
      .map((l) => normalizeImageUrl(l.trim(), ''))
      .filter(Boolean)
  );
}

function pushJsonLdImageValues(v, out) {
  if (typeof v === 'string') {
    out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) pushJsonLdImageValues(x, out);
    return;
  }
  if (v && typeof v === 'object') {
    if (typeof v.url === 'string') out.push(v.url);
    if (typeof v.contentUrl === 'string') out.push(v.contentUrl);
    collectImagesFromJsonLdNode(v, out, 1);
  }
}

/** Walk JSON-LD (including @graph) and collect URLs from image fields and ImageObject nodes. */
function collectImagesFromJsonLdNode(node, out, depth = 0) {
  if (depth > 50 || node == null) return;
  if (Array.isArray(node)) {
    for (const x of node) collectImagesFromJsonLdNode(x, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;

  const types = node['@type'];
  const typeStr = Array.isArray(types) ? types.join(',') : String(types || '');
  if (typeof node.url === 'string' && /ImageObject/i.test(typeStr)) {
    out.push(node.url);
  }

  for (const [k, v] of Object.entries(node)) {
    if (v == null) continue;
    if (k === 'image' || k === 'images' || k === 'thumbnail' || k === 'photo' || k === 'photos') {
      pushJsonLdImageValues(v, out);
    } else if (typeof v === 'object') {
      collectImagesFromJsonLdNode(v, out, depth + 1);
    }
  }
}

function collectImagesFromJsonLdScripts(doc) {
  const raw = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    const text = (s.textContent || '').trim();
    if (!text) return;
    try {
      const data = JSON.parse(text);
      collectImagesFromJsonLdNode(data, raw);
    } catch {
      /* ignore invalid JSON */
    }
  });
  return raw;
}

function firstSrcFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') return '';
  const first = srcset.split(',')[0].trim().split(/\s+/)[0];
  return first || '';
}

/** Heuristic: visible product-style images from the DOM (og alone is often a single file). */
function collectImagesFromDom(doc, pageUrl) {
  const out = [];
  const imgish = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

  for (const el of doc.querySelectorAll('img[src], img[data-src]')) {
    const src =
      el.getAttribute('data-src') ||
      el.getAttribute('data-lazy-src') ||
      el.getAttribute('src') ||
      '';
    const w = parseInt(el.getAttribute('width') || '0', 10);
    const h = parseInt(el.getAttribute('height') || '0', 10);
    if (w > 0 && h > 0 && w < 100 && h < 100) continue;
    const u = normalizeImageUrl(src, pageUrl);
    if (!u || !imgish.test(u)) continue;
    if (/pixel|spacer|blank|1x1|tracking|beacon|favicon|sprite/i.test(u)) continue;
    out.push(u);
  }

  for (const el of doc.querySelectorAll('source[srcset]')) {
    const u = normalizeImageUrl(firstSrcFromSrcset(el.getAttribute('srcset')), pageUrl);
    if (u && imgish.test(u) && !/pixel|spacer|1x1/i.test(u)) out.push(u);
  }

  return out;
}

function parseProductHtml(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pick = (sel) => doc.querySelector(sel)?.getAttribute('content')?.trim();
  const title =
    pick('meta[property="og:title"]') ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';
  const desc =
    pick('meta[property="og:description"]') ||
    pick('meta[name="description"]') ||
    '';
  const baseUrl = pageUrl || '';

  const fromMeta = [];
  doc.querySelectorAll('meta[property="og:image"]').forEach((m) => {
    const u = normalizeImageUrl(m.getAttribute('content') || '', baseUrl);
    if (u) fromMeta.push(u);
  });
  const tw = normalizeImageUrl(pick('meta[name="twitter:image"]') || '', baseUrl);
  if (tw) fromMeta.push(tw);
  for (let i = 0; i < 8; i++) {
    const u = normalizeImageUrl(
      doc.querySelector(`meta[name="twitter:image${i}"]`)?.getAttribute('content')?.trim() || '',
      baseUrl
    );
    if (u) fromMeta.push(u);
  }

  const fromLd = collectImagesFromJsonLdScripts(doc).map((r) => normalizeImageUrl(r, baseUrl)).filter(Boolean);
  const fromDom = collectImagesFromDom(doc, baseUrl);
  const fromScripts = collectImagesFromInlineJsonScripts(doc)
    .map((r) => normalizeImageUrl(r, baseUrl))
    .filter(Boolean);
  const anchor = fromMeta[0] || '';
  const fromRawHtml = collectImagesFromHtmlString(html, anchor).map((r) => normalizeImageUrl(r, baseUrl)).filter(Boolean);

  const merged = dedupeImageUrls([...fromMeta, ...fromLd, ...fromDom, ...fromScripts, ...fromRawHtml]);
  const maxImages = 36;
  const images = merged.slice(0, maxImages);

  return { title, desc, images };
}

let state = {
  suppliers: loadSuppliers(),
  caption: localStorage.getItem(STORAGE_CAPTION) || '',
  slideCount: Math.min(7, Math.max(3, parseInt(localStorage.getItem(STORAGE_SLIDES) || '5', 10) || 5)),
  product: {
    title: '',
    desc: '',
    images: [],
    extraImageLines: localStorage.getItem(STORAGE_EXTRA_IMAGES) || ''
  },
  activeSlide: 0,
  fetchMsg: '',
  fetchErr: ''
};

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header class="hdr">
      <div>
        <span class="badge">Studio B Home</span>
        <h1>Post Studio</h1>
        <p class="hdr-sub">Luxury Instagram carousels from supplier pages. All Studio B Post Studio code and data for this tool belong in this repository only.</p>
      </div>
      <img class="hdr-logo" src="/logo.svg" alt="Studio B Home" width="120" height="120" />
    </header>

    <div class="grid">
      <section class="panel">
        <h2>Suppliers</h2>
        <p class="panel-note">Henge, Dedon, and Walter Knoll are defaults. Edit URLs anytime; data stays in this browser.</p>
        <div id="sup-list"></div>
        <div class="row" style="margin-top:8px">
          <button type="button" class="btn btn-ghost" id="btn-add-sup">Add supplier</button>
        </div>

        <h2 style="margin-top:28px">Product page</h2>
        <p class="panel-note">Paste a product URL from an allowlisted supplier domain. Works when the app is served with <code style="font-size:11px">/api/fetch-url</code> (e.g. <strong>vercel dev</strong> or a Vercel deployment).</p>
        <div class="field">
          <label for="product-url">Product URL</label>
          <input type="url" id="product-url" placeholder="https://www.dedon.de/..." autocomplete="off" />
        </div>
        <div class="row">
          <button type="button" class="btn btn-primary" id="btn-fetch">Import page</button>
        </div>
        <div id="fetch-feedback"></div>

        <div class="field" style="margin-top:20px">
          <label for="title-edit">Product title</label>
          <input type="text" id="title-edit" value="${escapeHtml(state.product.title)}" />
        </div>
        <div class="field">
          <label for="desc-edit">Short description (for slides)</label>
          <textarea id="desc-edit" rows="3">${escapeHtml(state.product.desc)}</textarea>
        </div>
        <div class="field">
          <label for="extra-images">Extra product image URLs (one per line)</label>
          <textarea id="extra-images" rows="4" placeholder="Paste direct image links from the supplier gallery (right-click image → copy address). Optional if import finds enough photos.">${escapeHtml(state.product.extraImageLines)}</textarea>
        </div>
      </section>

      <section class="panel">
        <h2>Caption</h2>
        <p class="panel-note">Longer storytelling for Instagram. Polish manually here; optional AI wiring can use the same Gemini proxy pattern as other Midas tools.</p>
        <div class="field">
          <label for="caption">Caption draft</label>
          <textarea id="caption" placeholder="Tell the story: materials, designer, how to experience it in the showroom…">${escapeHtml(state.caption)}</textarea>
        </div>

        <h2 style="margin-top:22px">Carousel</h2>
        <p class="panel-note">3–7 slides. First slides cycle imported + extra image URLs; last slide is showroom + logo.</p>
        <div class="field">
          <label for="slide-count">Number of slides</label>
          <select id="slide-count">
            ${[3, 4, 5, 6, 7]
              .map(
                (n) =>
                  `<option value="${n}" ${n === state.slideCount ? 'selected' : ''}>${n} slides</option>`
              )
              .join('')}
          </select>
        </div>
      </section>

      <section class="panel full-span">
        <h2>Preview</h2>
        <p class="panel-note">4:5 aspect ratio. Dots match Instagram carousel position.</p>
        <div class="phone">
          <div class="phone-notch"><span></span></div>
          <div class="slide-viewport" id="slide-viewport"></div>
          <div class="dots" id="dots"></div>
          <div class="nav-slides">
            <button type="button" class="btn btn-ghost" id="prev-slide">Previous</button>
            <button type="button" class="btn btn-ghost" id="next-slide">Next</button>
          </div>
        </div>
      </section>
    </div>
  `;

  renderSuppliers();
  renderSlides();
  bind();
}

function renderSuppliers() {
  const wrap = document.getElementById('sup-list');
  if (!wrap) return;
  wrap.innerHTML = state.suppliers
    .map(
      (s) => `
    <div class="sup-item" data-id="${s.id}">
      <input type="text" class="sup-name" data-id="${s.id}" value="${escapeHtml(s.name)}" placeholder="Name" />
      <input type="url" class="sup-url" data-id="${s.id}" value="${escapeHtml(s.url)}" placeholder="https://…" />
      <button type="button" class="btn btn-ghost btn-remove" data-id="${s.id}">Remove</button>
    </div>
  `
    )
    .join('');
}

function productImageUrlsForSlides() {
  const manual = parseExtraImageLines(state.product.extraImageLines);
  const auto = state.product.images || [];
  const merged = dedupeImageUrls([...auto, ...manual]);
  return merged.length ? merged : [];
}

function slidesPlan() {
  const n = state.slideCount;
  const imgs = productImageUrlsForSlides();
  const list = imgs.length ? imgs : ['/logo.svg'];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    out.push({ type: 'image', src: list[i % list.length] });
  }
  out.push({ type: 'brand' });
  return out;
}

function renderSlides() {
  const vp = document.getElementById('slide-viewport');
  const dots = document.getElementById('dots');
  if (!vp || !dots) return;

  const plan = slidesPlan();
  state.activeSlide = Math.min(state.activeSlide, plan.length - 1);

  vp.innerHTML = plan
    .map((slide, i) => {
      if (slide.type === 'brand') {
        return `
        <div class="slide ${i === state.activeSlide ? 'active' : ''}" data-i="${i}">
          <img src="/logo.svg" alt="" style="object-fit:contain;object-position:center;padding:18%;background:#111;" />
          <div class="slide-brand">
            <strong>Visit Studio B Home</strong>
            ${SHOWROOM.lines.map((l) => escapeHtml(l)).join('<br />')}
            <br /><br />
            ${SHOWROOM.hours.map((h) => escapeHtml(h)).join(' · ')}
          </div>
        </div>`;
      }
      const title = state.product.title || 'New arrival';
      const desc = state.product.desc || '';
      const ext = /^https?:\/\//i.test(slide.src);
      return `
        <div class="slide ${i === state.activeSlide ? 'active' : ''}" data-i="${i}">
          <img src="${escapeHtml(slide.src)}" alt=""${ext ? ' referrerpolicy="no-referrer"' : ''} />
          <div class="slide-brand">
            <strong>${escapeHtml(title)}</strong>
            ${escapeHtml(desc).slice(0, 220)}${desc.length > 220 ? '…' : ''}
          </div>
        </div>`;
    })
    .join('');

  dots.innerHTML = plan
    .map(
      (_, i) =>
        `<button type="button" class="${i === state.activeSlide ? 'active' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
    )
    .join('');

  const fb = document.getElementById('fetch-feedback');
  if (fb) {
    fb.innerHTML =
      state.fetchErr ?
        `<div class="msg msg-err">${escapeHtml(state.fetchErr)}</div>`
      : state.fetchMsg ?
        `<div class="msg msg-info">${escapeHtml(state.fetchMsg)}</div>`
      : '';
  }
}

function bind() {
  document.getElementById('btn-add-sup')?.addEventListener('click', () => {
    state.suppliers.push({ id: crypto.randomUUID(), name: '', url: '' });
    saveSuppliers(state.suppliers);
    renderSuppliers();
  });

  document.getElementById('sup-list')?.addEventListener('input', (e) => {
    const t = e.target;
    const id = t.dataset.id;
    if (!id) return;
    const row = state.suppliers.find((s) => s.id === id);
    if (!row) return;
    if (t.classList.contains('sup-name')) row.name = t.value;
    if (t.classList.contains('sup-url')) row.url = t.value;
    saveSuppliers(state.suppliers);
  });

  document.getElementById('sup-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove');
    if (!btn) return;
    const id = btn.dataset.id;
    state.suppliers = state.suppliers.filter((s) => s.id !== id);
    saveSuppliers(state.suppliers);
    renderSuppliers();
  });

  document.getElementById('btn-fetch')?.addEventListener('click', async () => {
    const input = document.getElementById('product-url');
    const url = (input?.value || '').trim();
    state.fetchErr = '';
    state.fetchMsg = '';
    if (!url) {
      state.fetchErr = 'Enter a product URL.';
      renderSlides();
      return;
    }
    try {
      const res = await fetch('/api/fetch-url?url=' + encodeURIComponent(url));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        state.fetchErr = data.error || 'Fetch failed (' + res.status + '). Run `vercel dev` or deploy to Vercel for /api/fetch-url.';
        renderSlides();
        return;
      }
      const parsed = parseProductHtml(data.html || '', data.finalUrl || url);
      const extraImageLines =
        document.getElementById('extra-images')?.value ?? state.product.extraImageLines;
      state.product = {
        title: parsed.title,
        desc: parsed.desc,
        images: parsed.images.length ? parsed.images : [],
        extraImageLines
      };
      const nImg = parsed.images.length;
      state.fetchMsg =
        nImg > 1 ? `Imported ${nImg} image URLs from page.`
        : nImg === 1 ?
          'Imported 1 image from page. Add more URLs below or paste gallery links if slides repeat the same photo.'
        : 'Imported text only; no images found in HTML. Paste direct image URLs below.';
      document.getElementById('title-edit').value = state.product.title;
      document.getElementById('desc-edit').value = state.product.desc;
      state.activeSlide = 0;
      renderSlides();
    } catch {
      state.fetchErr =
        'Could not reach /api/fetch-url. From this folder run: npx vercel dev — or open the deployed Vercel URL.';
      renderSlides();
    }
  });

  document.getElementById('title-edit')?.addEventListener('input', (e) => {
    state.product.title = e.target.value;
    renderSlides();
  });
  document.getElementById('desc-edit')?.addEventListener('input', (e) => {
    state.product.desc = e.target.value;
    renderSlides();
  });

  document.getElementById('extra-images')?.addEventListener('input', (e) => {
    state.product.extraImageLines = e.target.value;
    localStorage.setItem(STORAGE_EXTRA_IMAGES, state.product.extraImageLines);
    renderSlides();
  });

  document.getElementById('caption')?.addEventListener('input', (e) => {
    state.caption = e.target.value;
    localStorage.setItem(STORAGE_CAPTION, state.caption);
  });

  document.getElementById('slide-count')?.addEventListener('change', (e) => {
    state.slideCount = parseInt(e.target.value, 10);
    localStorage.setItem(STORAGE_SLIDES, String(state.slideCount));
    state.activeSlide = 0;
    renderSlides();
  });

  document.getElementById('dots')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    state.activeSlide = parseInt(b.dataset.i, 10);
    renderSlides();
  });

  document.getElementById('prev-slide')?.addEventListener('click', () => {
    const n = slidesPlan().length;
    state.activeSlide = (state.activeSlide - 1 + n) % n;
    renderSlides();
  });
  document.getElementById('next-slide')?.addEventListener('click', () => {
    const n = slidesPlan().length;
    state.activeSlide = (state.activeSlide + 1) % n;
    renderSlides();
  });
}

render();
