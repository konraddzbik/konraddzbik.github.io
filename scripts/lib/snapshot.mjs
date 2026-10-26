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

export const MAX_SNAPSHOT_AGE_DAYS = 14;

// Produce a snapshot without ever publishing invalid or silently degraded data:
//   1. live source → 2. the validated copy currently deployed on the site (if < 14 days old).
// If both fail, throw: a failed build keeps the current deployment live, which beats replacing
// good data with an empty list. `allowEmpty` (ALLOW_EMPTY_SNAPSHOT=1) exists only to bootstrap
// a site that has no deployed copy yet; the page then links to GitHub/Medium instead.
export async function snapshotWithFallback({ name, fetchLive, validate, allowEmpty = false, now = Date.now(), log = console }) {
  const problems = [];
  try {
    const data = await fetchLive();
    validate(data);
    return { data, origin: 'live' };
  } catch (err) {
    problems.push(`live source failed: ${err.message}`);
  }
  try {
    const res = await fetchWithTimeout(`${SITE_URL}/assets/data/${name}.json`);
    const data = await res.json();
    validate(data);
    const ageDays = (now - Date.parse(data.generatedAt)) / 86_400_000;
    if (!(ageDays <= MAX_SNAPSHOT_AGE_DAYS)) {
      throw new Error(`deployed copy is stale (generatedAt ${data.generatedAt})`);
    }
    log.warn(`::warning::${name}: ${problems[0]}; reusing deployed copy from ${data.generatedAt}`);
    return { data, origin: 'deployed' };
  } catch (err) {
    problems.push(`deployed copy unusable: ${err.message}`);
  }
  if (!allowEmpty) {
    throw new Error(`${name}: no valid snapshot (${problems.join('; ')}). Set ALLOW_EMPTY_SNAPSHOT=1 only to bootstrap.`);
  }
  log.warn(`::warning::${name}: ${problems.join('; ')}; publishing an empty list (ALLOW_EMPTY_SNAPSHOT)`);
  const data = { generatedAt: new Date(now).toISOString(), source: null, items: [] };
  validate(data);
  return { data, origin: 'empty' };
}
