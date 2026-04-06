/**
 * Proxy supplier images so thumbnails and previews load despite hotlink / Referer rules.
 * Same host allowlist as fetch-url (including *.walterknoll.de CDN, etc.).
 */
import { isAllowlistedHost, refererForImageHost } from './allowlist.js';

const MAX_BYTES = 15 * 1024 * 1024;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function guessTypeFromPath(pathname) {
  const lower = pathname.toLowerCase();
  if (/\.jpe?g(\?|$)/i.test(lower)) return 'image/jpeg';
  if (/\.png(\?|$)/i.test(lower)) return 'image/png';
  if (/\.webp(\?|$)/i.test(lower)) return 'image/webp';
  if (/\.gif(\?|$)/i.test(lower)) return 'image/gif';
  if (/\.svg(\?|$)/i.test(lower)) return 'image/svg+xml';
  if (/\.avif(\?|$)/i.test(lower)) return 'image/avif';
  return '';
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Method not allowed');
    return;
  }

  const q = req.query && req.query.url;
  const urlStr = typeof q === 'string' ? q : Array.isArray(q) ? q[0] : '';

  if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Bad url');
    return;
  }

  let hostname = '';
  let pathname = '/';
  try {
    const u = new URL(urlStr);
    hostname = u.hostname.toLowerCase();
    pathname = u.pathname || '/';
  } catch {
    res.statusCode = 400;
    res.end('Invalid URL');
    return;
  }

  if (!isAllowlistedHost(hostname)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Host not allowed');
    return;
  }

  const referer = refererForImageHost(hostname);

  try {
    const r = await fetch(urlStr, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        Referer: referer
      }
    });

    if (!r.ok) {
      res.statusCode = r.status;
      res.end();
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      res.statusCode = 413;
      res.end('Payload too large');
      return;
    }

    let ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    const pathGuess = guessTypeFromPath(pathname) || guessTypeFromPath(urlStr);
    const looksImage =
      /^image\//i.test(ct) ||
      /application\/octet-stream/i.test(ct) ||
      !!pathGuess;

    if (!looksImage) {
      res.statusCode = 415;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Not an image');
      return;
    }

    if (!/^image\//i.test(ct)) {
      ct = pathGuess || 'image/jpeg';
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain');
    res.end(e.message || 'Proxy failed');
  }
}
