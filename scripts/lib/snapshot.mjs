// Shared helpers for build-time data snapshots. Node built-ins only: this code runs with a
// GitHub token in the environment, so it must not load third-party packages.

export const SITE_URL = 'https://konraddzbik.github.io';
const FETCH_TIMEOUT_MS = 15_000;

// Hosts the page may load article images from. Must match `img-src` in index.html's CSP
// (enforced by scripts/test/site.test.mjs).
export const MEDIUM_IMAGE_HOSTS = ['cdn-images-1.medium.com', 'miro.medium.com'];

// Returns a normalized https URL when `value` is on one of `hosts` (exact match, or a subdomain
// when the entry starts with "."), otherwise null.
export function httpsUrlOn(value, hosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const ok = hosts.some(h => (h.startsWith('.') ? url.hostname.endsWith(h) || url.hostname === h.slice(1) : url.hostname === h));
  return ok ? url : null;
}

export async function fetchWithTimeout(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res;
}

export function assert(condition, message) {
  if (!condition) throw new Error(`invalid snapshot: ${message}`);
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !isNaN(Date.parse(value));
}

// Produce a snapshot without ever publishing invalid data:
//   1. live source → 2. the copy currently deployed on the site → 3. an empty list.
// The page renders a "see it on GitHub/Medium" link for an empty list.
export async function snapshotWithFallback({ name, fetchLive, validate, log = console }) {
  try {
    const data = await fetchLive();
    validate(data);
    return { data, origin: 'live' };
  } catch (err) {
    log.warn(`::warning::${name}: live source failed (${err.message}); trying deployed copy`);
  }
  try {
    const res = await fetchWithTimeout(`${SITE_URL}/assets/data/${name}.json`);
    const data = await res.json();
    validate(data);
    return { data, origin: 'deployed' };
  } catch (err) {
    log.warn(`::warning::${name}: deployed copy unavailable (${err.message}); publishing an empty list`);
  }
  const data = { generatedAt: new Date().toISOString(), source: null, items: [] };
  validate(data);
  return { data, origin: 'empty' };
}
