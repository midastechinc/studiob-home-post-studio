/**
 * Server-side fetch for supplier product pages (bypasses browser CORS).
 * Host allowlist only — extend as you add suppliers.
 *
 * Also extracts image URLs from raw HTML (Next/Nuxt JSON blobs, og tags, img src)
 * because many sites only embed full galleries server-side for real browser UAs.
 */
const ALLOWED_HOSTS = new Set([
  'henge07.com',
  'www.henge07.com',
  'dedon.de',
  'www.dedon.de',
  'walterknoll.de',
  'www.walterknoll.de'
]);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isJunkImageUrl(u) {
  return /favicon|sprite|icons?\/|\/icon-|logo-|avatar|gravatar|pixel|spacer|1x1|placeholder|badge-|loading\.|blank\.|apple-touch|ms-icon|og-image-default|social-share|share-icon|payment-|credit-card|trustpilot|facebook\.com|twitter\.com|linkedin\.com|google-analytics|googletagmanager|doubleclick|hotjar|clarity\.ms|data:image/i.test(
    u
  );
}

function normalizeUrl(raw, baseUrl) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = 'https:' + u;
  if (/^https?:/i.test(u)) return u;
  try {
    return new URL(u, baseUrl || 'https://invalid.local').href;
  } catch {
    return '';
  }
}

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const u of urls) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function walkJsonForImages(node, out, depth) {
  if (out.length >= 220 || depth > 120 || node == null) return;
  if (typeof node === 'string') {
    if (!/^https?:\/\//i.test(node)) return;
    if (!/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(node)) return;
    if (isJunkImageUrl(node)) return;
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) walkJsonForImages(x, out, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const v of Object.values(node)) {
      walkJsonForImages(v, out, depth + 1);
    }
  }
}

function extractFromScriptById(html, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<script[^>]*\\bid=["']${esc}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const m = html.match(re);
  if (!m) return [];
  try {
    const data = JSON.parse(m[1].trim());
    const out = [];
    walkJsonForImages(data, out, 0);
    return out;
  } catch {
    return [];
  }
}

function extractOgImages(html, baseUrl) {
  const out = [];
  const re = /<meta\s+([^>]+)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    if (!/property\s*=\s*["']og:image["']/i.test(attrs)) continue;
    const cm = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (cm) {
      const u = normalizeUrl(cm[1], baseUrl);
      if (u) out.push(u);
    }
  }
  return out;
}

function extractJsonLdScripts(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      walkJsonForImages(data, out, 0);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function extractImgSrcFromHtml(html, baseUrl) {
  const out = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = /\b(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const raw = srcMatch[1];
    if (!/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(raw)) continue;
    if (isJunkImageUrl(raw)) continue;
    const u = normalizeUrl(raw, baseUrl);
    if (u) out.push(u);
  }
  return out;
}

function regexScanHtmlUrls(html, anchorUrl) {
  const re = /https?:\/\/[^\s"'<>\\`]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>\\`#]*)?/gi;
  const hits = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (hits.length > 200) break;
    let u = m[0].replace(/\\u002f/gi, '/').replace(/\\u0026/g, '&');
    u = u.replace(/[,;)}'"]+$/g, '');
    if (isJunkImageUrl(u)) continue;
    hits.push({ u, i: m.index });
  }
  let host = '';
  try {
    host = anchorUrl ? new URL(anchorUrl).hostname : '';
  } catch {
    host = '';
  }
  hits.sort((a, b) => {
    let sa = 0;
    let sb = 0;
    try {
      if (host && new URL(a.u).hostname === host) sa += 10;
      if (host && new URL(b.u).hostname === host) sb += 10;
    } catch {
      /* ignore */
    }
    if (sb !== sa) return sb - sa;
    return a.i - b.i;
  });
  return dedupe(hits.map((h) => h.u));
}

/**
 * Best-effort gallery URLs from SSR HTML (no browser / no JS execution).
 */
function extractProductImageUrls(html, finalUrl) {
  if (!html) return [];
  const base = finalUrl || '';
  const og = extractOgImages(html, base);
  const anchor = og[0] || '';
  const merged = dedupe([
    ...og,
    ...extractJsonLdScripts(html),
    ...extractFromScriptById(html, '__NEXT_DATA__'),
    ...extractFromScriptById(html, '__NUXT_DATA__'),
    ...extractImgSrcFromHtml(html, base),
    ...regexScanHtmlUrls(html, anchor)
  ]);
  return merged.slice(0, 48);
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
  'Cache-Control': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1'
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  let urlStr = '';
  if (req.method === 'GET') {
    const q = req.query && req.query.url;
    urlStr = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : '';
  } else if (req.method === 'POST' && req.body) {
    urlStr = typeof req.body.url === 'string' ? req.body.url : '';
  }

  if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing or invalid url' }));
    return;
  }

  let host = '';
  try {
    host = new URL(urlStr).hostname.toLowerCase();
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid URL' }));
    return;
  }

  if (!ALLOWED_HOSTS.has(host)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Host not allowlisted', host }));
    return;
  }

  try {
    const r = await fetch(urlStr, {
      redirect: 'follow',
      headers: BROWSER_HEADERS
    });
    const html = await r.text();
    const finalUrl = r.url;
    const slice = html.slice(0, 2_000_000);
    const imageUrls = extractProductImageUrls(slice, finalUrl);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        status: r.status,
        finalUrl,
        html: slice,
        imageUrls
      })
    );
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e.message || 'Fetch failed' }));
  }
}
