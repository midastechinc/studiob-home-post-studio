/**
 * Supplier hosts for HTML fetch and image proxy.
 * Exact names plus subdomains of the same brands (CDN / media).
 */
export const ALLOWED_HOST_EXACT = new Set([
  'henge07.com',
  'www.henge07.com',
  'dedon.de',
  'www.dedon.de',
  'walterknoll.de',
  'www.walterknoll.de'
]);

const ALLOWED_SUFFIXES = ['.walterknoll.de', '.dedon.de', '.henge07.com', '.henge07.it'];

export function isAllowlistedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (ALLOWED_HOST_EXACT.has(h)) return true;
  return ALLOWED_SUFFIXES.some((s) => h.endsWith(s));
}

/** Referer many CDNs expect (main site, not CDN hostname). */
export function refererForImageHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h.endsWith('.walterknoll.de') || h === 'walterknoll.de') return 'https://www.walterknoll.de/';
  if (h.endsWith('.dedon.de') || h === 'dedon.de') return 'https://www.dedon.de/';
  if (h.endsWith('.henge07.com') || h === 'henge07.com') return 'https://www.henge07.com/';
  if (h.endsWith('.henge07.it')) return 'https://www.henge07.com/';
  return `https://${h}/`;
}
