// GitHub REST API → repositories snapshot.
import { assert, fetchWithTimeout, httpsUrlOn } from './snapshot.mjs';

export const REPOS_URL = 'https://api.github.com/users/konraddzbik/repos?sort=updated&per_page=30&type=owner';
const MAX_ITEMS = 6;
const TEXT_LENGTH = 300;

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TEXT_LENGTH) : null);

export function normalizeRepos(repos) {
  assert(Array.isArray(repos), 'repos: API payload is not an array');
  const items = repos
    .filter(r => r && !r.fork && !r.archived && !r.private)
    .map(r => {
      const url = httpsUrlOn(r.html_url, ['github.com']);
      const name = clean(r.name);
      if (!url || !name) return null;
      return {
        name,
        description: clean(r.description) || null,
        url: url.href,
        language: clean(r.language) || null,
        stars: Number.isInteger(r.stargazers_count) && r.stargazers_count >= 0 ? r.stargazers_count : 0,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  return { generatedAt: new Date().toISOString(), source: REPOS_URL, items };
}

export function validateRepos(data) {
  assert(data && typeof data === 'object' && Array.isArray(data.items), 'repos: items must be an array');
  assert(data.items.length <= MAX_ITEMS, 'repos: too many items');
  for (const r of data.items) {
    assert(typeof r.name === 'string' && r.name.length > 0 && r.name.length <= TEXT_LENGTH, 'repos: bad name');
    assert(httpsUrlOn(r.url, ['github.com']), `repos: bad url ${r.url}`);
    assert(r.description === null || (typeof r.description === 'string' && r.description.length <= TEXT_LENGTH), 'repos: bad description');
    assert(r.language === null || typeof r.language === 'string', 'repos: bad language');
    assert(Number.isInteger(r.stars) && r.stars >= 0, 'repos: bad stars');
  }
}

export async function fetchRepos({ token } = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'konraddzbik.github.io build' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchWithTimeout(REPOS_URL, { headers });
  const data = normalizeRepos(await res.json());
  assert(data.items.length > 0, 'repos: no public, non-fork repositories');
  return data;
}
