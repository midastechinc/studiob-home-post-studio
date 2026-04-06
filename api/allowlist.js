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

/**
 * Exact third-party CDN hosts used on supplier sites (not *.supplier.tld).
 * Keys must be lowercase. Values = Referer header the CDN expects.
 * Walter Knoll product imagery is served from this CloudFront distribution.
 */
export const CDN_HOST_REFERER = {
  'd248k8q1c80cf8.cloudfront.net': 'https://www.walterknoll.de/',
  // Mood / materials swatches and some gallery sizes (URLs show as …amazonaws.com/…)
  'wk-prod-assets.s3.eu-central-1.amazonaws.com': 'https://www.walterknoll.de/'
};

export function isAllowlistedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (ALLOWED_HOST_EXACT.has(h)) return true;
  if (Object.prototype.hasOwnProperty.call(CDN_HOST_REFERER, h)) return true;
  return ALLOWED_SUFFIXES.some((s) => h.endsWith(s));
}

/** Referer many CDNs expect (main site, not CDN hostname). */
export function refererForImageHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(CDN_HOST_REFERER, h)) return CDN_HOST_REFERER[h];
  if (h.endsWith('.walterknoll.de') || h === 'walterknoll.de') return 'https://www.walterknoll.de/';
  if (h.endsWith('.dedon.de') || h === 'dedon.de') return 'https://www.dedon.de/';
  if (h.endsWith('.henge07.com') || h === 'henge07.com') return 'https://www.henge07.com/';
  if (h.endsWith('.henge07.it')) return 'https://www.henge07.com/';
  return `https://${h}/`;
}
