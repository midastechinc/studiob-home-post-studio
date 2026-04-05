/**
 * Server-side fetch for supplier product pages (bypasses browser CORS).
 * Host allowlist only — extend as you add suppliers.
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
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudioBPostStudio/1.0; +https://studiobhome.com)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const html = await r.text();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        ok: true,
        status: r.status,
        finalUrl: r.url,
        html: html.slice(0, 2_000_000)
      })
    );
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: e.message || 'Fetch failed' }));
  }
}
