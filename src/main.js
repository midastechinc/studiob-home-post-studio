import './style.css';

const STORAGE_SUPPLIERS = 'sb-suppliers-v1';
const STORAGE_CAPTION = 'sb-caption-v1';
const STORAGE_SLIDES = 'sb-slide-count-v1';

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

function resolveUrl(raw, base) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim().split(/\s+/)[0];
  if (!t || t.startsWith('data:') || t.startsWith('javascript:')) return '';
  try {
    return new URL(t, base).href;
  } catch {
    return '';
  }
}

function normalizeUrlKey(href) {
  try {
    const u = new URL(href);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) =>
      u.searchParams.delete(k)
    );
    return u.href;
  } catch {
    return href;
  }
}

function isJunkImageUrl(href) {
  const lower = href.toLowerCase();
  if (
    /data:image|\.ico(\?|$)|favicon|pixel\.gif|spacer|1x1|doubleclick|google-analytics|googletagmanager|facebook\.com\/tr/i.test(
      lower
    )
  )
    return true;
  if (
    /logo[_-]?only|site[_-]?logo|brand[_-]?mark|payment|trust[-_]?badge|sprite|avatar[-_]?|profile[-_]?photo/i.test(
      lower
    )
  )
    return true;
  if (/(?:^|\/)icons?\/|\/i\/icons\/|social[-_]icons?|share[-_]icons?/i.test(lower)) return true;
  return false;
}

function scoreImageUrl(href) {
  if (!href || isJunkImageUrl(href)) return -100;
  let s = 0;
  const lower = href.toLowerCase();
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)) s += 4;
  if (/\.gif(\?|$)/i.test(lower)) s -= 1;
  if (/\.svg(\?|$)/i.test(lower)) s -= 4;
  const dim = lower.match(/(\d{3,4})\s*x\s*(\d{3,4})/);
  if (dim) {
    const a = parseInt(dim[1], 10) * parseInt(dim[2], 10);
    if (a >= 800_000) s += 12;
    else if (a >= 500_000) s += 9;
    else if (a >= 200_000) s += 6;
    else if (a >= 80_000) s += 3;
  }
  if (/\b(w|width|h|height)=['"]?\d{1,3}\b/.test(lower)) s -= 4;
  if (/_\d{2,3}x\d{2,3}[-_.]|[-_]thumb|[-_]small|[-_]mini|[-_]tiny|[-_]xs[-_.]/i.test(lower)) s -= 10;
  if (
    /(?:product|gallery|zoom|hero|large|full|hd|hi[-_]?res|master|original|detail|scene|lifestyle|roomshot|ambiente|stilllife|collection)/i.test(
      lower
    )
  )
    s += 10;
  if (/\b(cdn|shopify|cloudinary|imgix|scene7|contentful|akamai)\b/i.test(lower)) s += 2;
  if (/banner|deal|sale[-_]?|promo|newsletter|header[-_]?bg|footer|category[-_]?tile/i.test(lower)) s -= 8;
  return s;
}

function urlsFromSrcset(srcset, base) {
  if (!srcset || typeof srcset !== 'string') return [];
  const parts = [];
  for (const chunk of srcset.split(',')) {
    const seg = chunk.trim().split(/\s+/);
    const u = seg[0];
    if (!u) continue;
    const cand = seg.find((x) => /^\d+w$/i.test(x));
    const w = cand ? parseInt(cand, 10) : 0;
    const r = resolveUrl(u, base);
    if (r) parts.push({ url: r, w });
  }
  parts.sort((a, b) => b.w - a.w);
  const out = [];
  const seen = new Set();
  for (const { url } of parts) {
    const k = normalizeUrlKey(url);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(url);
    }
  }
  return out;
}

function extractJsonLdProductImages(doc, base) {
  const urls = [];
  for (const sc of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = sc.textContent?.trim();
    if (!raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    let items;
    if (data && Array.isArray(data['@graph'])) items = data['@graph'];
    else items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rawT = item['@type'];
      const types = (Array.isArray(rawT) ? rawT : [rawT])
        .filter(Boolean)
        .map((t) => (typeof t === 'string' ? t : ''));
      const isProduct = types.some((t) => /Product|ProductGroup|IndividualProduct/i.test(t));
      if (!isProduct) continue;
      const img = item.image;
      const add = (u) => {
        const r = resolveUrl(u, base);
        if (r) urls.push(r);
      };
      if (typeof img === 'string') add(img);
      else if (Array.isArray(img)) {
        img.forEach((x) => {
          if (typeof x === 'string') add(x);
          else if (x && typeof x === 'object' && x.url) add(x.url);
        });
      } else if (img && typeof img === 'object' && img.url) add(img.url);
    }
  }
  return urls;
}

function collectScoredImageCandidates(doc, baseHref) {
  const scored = [];

  const bump = (href, boost) => {
    const r = resolveUrl(href, baseHref);
    if (!r) return;
    scored.push({ url: r, boost });
  };

  doc
    .querySelectorAll(
      'meta[property="og:image"], meta[property="og:image:url"], meta[property="og:image:secure_url"]'
    )
    .forEach((m) => bump(m.getAttribute('content'), 16));

  doc.querySelectorAll('meta[name^="twitter:image"], meta[property^="twitter:image"]').forEach((m) => {
    bump(m.getAttribute('content'), 11);
  });

  doc.querySelectorAll('link[rel="image_src"], link[rel="preload"][as="image"]').forEach((l) => {
    bump(l.getAttribute('href'), 9);
  });

  for (const u of extractJsonLdProductImages(doc, baseHref)) {
    scored.push({ url: u, boost: 18 });
  }

  doc.querySelectorAll('picture source[srcset]').forEach((s) => {
    for (const u of urlsFromSrcset(s.getAttribute('srcset'), baseHref)) {
      scored.push({ url: u, boost: 6 });
    }
  });

  const imgAttrs = [
    'src',
    'data-src',
    'data-lazy-src',
    'data-original',
    'data-zoom-image',
    'data-large_image',
    'data-srcset'
  ];
  doc.querySelectorAll('img').forEach((img) => {
    if (
      img.closest(
        'header, footer, nav, [role="navigation"], [class*="cookie" i], [id*="cookie" i], [class*="newsletter" i]'
      )
    )
      return;
    for (const a of imgAttrs) {
      const v = img.getAttribute(a);
      if (v && a !== 'data-srcset') bump(v, 4);
    }
    const ss = img.getAttribute('srcset');
    if (ss) {
      for (const u of urlsFromSrcset(ss, baseHref)) {
        scored.push({ url: u, boost: 5 });
      }
    }
  });

  const map = new Map();
  for (const { url, boost } of scored) {
    const key = normalizeUrlKey(url);
    const sc = scoreImageUrl(url) + boost;
    if (sc <= -80) continue;
    const prev = map.get(key);
    if (prev == null || sc > prev) map.set(key, sc);
  }

  const ranked = [...map.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 50);
}

function pickDefaultImages(candidates) {
  const out = [];
  for (const c of candidates) {
    if (out.length >= 8) break;
    if (c.score >= 3) out.push(c.url);
  }
  if (out.length < 3) {
    for (const c of candidates) {
      if (out.length >= 6) break;
      if (!out.includes(c.url)) out.push(c.url);
    }
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

  let base = pageUrl;
  try {
    base = new URL(pageUrl).href;
  } catch {
    /* keep */
  }

  const candidates = collectScoredImageCandidates(doc, base);
  const defaultImages = pickDefaultImages(candidates);

  return { title, desc, candidates, defaultImages };
}

let state = {
  suppliers: loadSuppliers(),
  caption: localStorage.getItem(STORAGE_CAPTION) || '',
  slideCount: Math.min(7, Math.max(3, parseInt(localStorage.getItem(STORAGE_SLIDES) || '5', 10) || 5)),
  product: { title: '', desc: '', images: [], candidates: [] },
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
      <img class="hdr-logo" src="/logo.png" alt="Studio B Home" width="120" height="120" />
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

        <div id="image-pick-section" class="image-pick-section" style="display:none;margin-top:22px">
          <h2 style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--sb-muted)">Images for carousel</h2>
          <p class="panel-note">Ranked for product photography (meta tags, JSON-LD, large <code style="font-size:11px">srcset</code> entries). Uncheck irrelevant shots; order follows this list.</p>
          <div class="img-pick-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="btn-img-all">Select all</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-img-none">Clear</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-img-best">Best guess</button>
          </div>
          <div class="img-pick-grid" id="img-pick-grid"></div>
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
        <p class="panel-note">3–7 slides. First slides use product images; last slide is showroom + logo.</p>
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
  renderImagePicker();
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

function renderImagePicker() {
  const sec = document.getElementById('image-pick-section');
  const grid = document.getElementById('img-pick-grid');
  if (!sec || !grid) return;
  const { candidates, images } = state.product;
  if (!candidates.length) {
    sec.style.display = 'none';
    grid.innerHTML = '';
    return;
  }
  sec.style.display = 'block';
  const selected = new Set(images);
  const maxShow = 50;
  const list = candidates.slice(0, maxShow);
  grid.innerHTML = list
    .map((c, i) => {
      const on = selected.has(c.url);
      const tail = c.url.length > 52 ? '…' + c.url.slice(-48) : c.url;
      return `<label class="img-pick-item${on ? ' selected' : ''}">
        <input type="checkbox" data-idx="${i}" ${on ? 'checked' : ''} />
        <div class="img-pick-thumb-wrap">
          <img class="img-pick-thumb" src="${escapeHtml(c.url)}" alt="" loading="lazy" crossorigin="anonymous" referrerpolicy="no-referrer" />
        </div>
        <div class="img-pick-meta" title="${escapeHtml(c.url)}">Score ${Math.round(c.score)} · ${escapeHtml(tail)}</div>
      </label>`;
    })
    .join('');
}

function readPickerSelection() {
  const grid = document.getElementById('img-pick-grid');
  if (!grid) return state.product.images.slice();
  const out = [];
  grid.querySelectorAll('input[type="checkbox"][data-idx]').forEach((cb) => {
    if (!cb.checked) return;
    const i = parseInt(cb.dataset.idx, 10);
    const c = state.product.candidates[i];
    if (c) out.push(c.url);
  });
  return out;
}

function slidesPlan() {
  const n = state.slideCount;
  const imgs = state.product.images.length
    ? state.product.images
    : ['/logo.png'];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    out.push({ type: 'image', src: imgs[i % imgs.length] });
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
          <img src="/logo.png" alt="" style="object-fit:contain;object-position:center;padding:18%;background:#111;" />
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
      return `
        <div class="slide ${i === state.activeSlide ? 'active' : ''}" data-i="${i}">
          <img src="${escapeHtml(slide.src)}" alt="" crossorigin="anonymous" />
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
      state.product = {
        title: parsed.title,
        desc: parsed.desc,
        candidates: parsed.candidates,
        images: parsed.defaultImages.length ? parsed.defaultImages : []
      };
      state.fetchMsg =
        parsed.candidates.length ?
          `Imported ${parsed.candidates.length} image candidate(s); ${state.product.images.length} selected for slides. Adjust checkboxes below if needed.`
        : 'Imported text only — no suitable images found on this page.';
      document.getElementById('title-edit').value = state.product.title;
      document.getElementById('desc-edit').value = state.product.desc;
      state.activeSlide = 0;
      renderImagePicker();
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

  document.getElementById('img-pick-grid')?.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-idx]');
    if (!cb) return;
    state.product.images = readPickerSelection();
    const lab = cb.closest('.img-pick-item');
    if (lab) lab.classList.toggle('selected', cb.checked);
    renderSlides();
  });

  document.getElementById('btn-img-all')?.addEventListener('click', () => {
    document.querySelectorAll('#img-pick-grid input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
      cb.closest('.img-pick-item')?.classList.add('selected');
    });
    state.product.images = readPickerSelection();
    renderSlides();
  });

  document.getElementById('btn-img-none')?.addEventListener('click', () => {
    document.querySelectorAll('#img-pick-grid input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
      cb.closest('.img-pick-item')?.classList.remove('selected');
    });
    state.product.images = [];
    renderSlides();
  });

  document.getElementById('btn-img-best')?.addEventListener('click', () => {
    state.product.images = pickDefaultImages(state.product.candidates);
    renderImagePicker();
    renderSlides();
  });
}

render();
