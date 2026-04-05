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
  let image =
    normalizeImageUrl(pick('meta[property="og:image"]') || pick('meta[name="twitter:image"]') || '', baseUrl);
  const extras = [];
  doc.querySelectorAll('meta[property="og:image"]').forEach((m, i) => {
    if (i === 0) return;
    const u = normalizeImageUrl(m.getAttribute('content') || '', baseUrl);
    if (u && u !== image) extras.push(u);
  });
  return { title, desc, images: [image, ...extras].filter(Boolean) };
}

let state = {
  suppliers: loadSuppliers(),
  caption: localStorage.getItem(STORAGE_CAPTION) || '',
  slideCount: Math.min(7, Math.max(3, parseInt(localStorage.getItem(STORAGE_SLIDES) || '5', 10) || 5)),
  product: { title: '', desc: '', images: [] },
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

function slidesPlan() {
  const n = state.slideCount;
  const imgs = state.product.images.length
    ? state.product.images
    : ['/logo.svg'];
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
      state.product = {
        title: parsed.title,
        desc: parsed.desc,
        images: parsed.images.length ? parsed.images : []
      };
      state.fetchMsg = 'Imported metadata from page.';
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
