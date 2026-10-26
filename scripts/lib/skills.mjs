// GitHub REST API → snapshot of every Agent Skill (SKILL.md) published in a public, non-fork,
// non-archived repository of the account.
import { assert, fetchWithTimeout, httpsUrlOn } from './snapshot.mjs';
import { githubHeaders } from './github.mjs';

const OWNER = 'konraddzbik';
export const SKILLS_SOURCE = `https://api.github.com/users/${OWNER}/repos?per_page=100&type=owner`;
const API = 'https://api.github.com';
const MAX_ITEMS = 30;
const TEXT_LENGTH = 300;
const NAME_LENGTH = 64;
const INSTALL_PATTERN = /^\/plugin marketplace add [A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const clean = (value, max = TEXT_LENGTH) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : null);

// Minimal YAML front matter reader for the top-level scalar keys a SKILL.md uses: plain,
// 'single'- or "double"-quoted, and block scalars (>, >-, |, |-). Node built-ins only, so no
// YAML package runs while the build holds a GitHub token.
export function parseFrontmatter(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0].trim() !== '---') return {};
  const end = lines.indexOf('---', 1);
  if (end === -1) return {};
  const body = lines.slice(1, end);
  const fields = {};
  for (let i = 0; i < body.length; i++) {
    const m = body[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    let value = raw.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const block = [];
      while (i + 1 < body.length && (/^\s/.test(body[i + 1]) || body[i + 1] === '')) block.push(body[++i].trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n').trim();
    } else if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      value = value.slice(1, -1).replace(/\\(["\\])/g, '$1');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    fields[key] = value;
  }
  return fields;
}

// A skill description is written for the model (long trigger-phrase lists); the card shows
// its first sentence (one ends where the next word starts with a capital, so "e.g." doesn't).
export function summarize(description) {
  const text = clean(description, 2000);
  if (!text) return null;
  const first = text.match(/^.+?[.!?](?=\s+["'(A-Z]|$)/)?.[0] ?? text;
  return first.length > TEXT_LENGTH ? first.slice(0, TEXT_LENGTH - 1).trimEnd() + '…' : first;
}

// paths: every file path in the repo's default-branch tree.
export function skillPaths(paths) {
  return paths.filter(p => (p === 'SKILL.md' || p.endsWith('/SKILL.md')) && !p.split('/').includes('node_modules'));
}

// repo: GitHub API repository object; path: SKILL.md path; markdown: its contents.
export function normalizeSkill(repo, path, markdown, { hasMarketplace = false } = {}) {
  const repoUrl = httpsUrlOn(repo.html_url, ['github.com']);
  if (!repoUrl) return null;
  const dir = path.split('/').slice(0, -1);
  const fields = parseFrontmatter(markdown);
  const name = clean(fields.name, NAME_LENGTH) || clean(dir.at(-1), NAME_LENGTH) || clean(repo.name, NAME_LENGTH);
  const description = summarize(fields.description);
  if (!name || !description) return null;
  const url = dir.length
    ? `${repoUrl.href}/tree/${encodeURIComponent(repo.default_branch)}/${dir.map(encodeURIComponent).join('/')}`
    : repoUrl.href;
  const spdx = clean(repo.license?.spdx_id, 40);
  return {
    name,
    description,
    url,
    repo: clean(repo.name, NAME_LENGTH),
    repoUrl: repoUrl.href,
    stars: Number.isInteger(repo.stargazers_count) && repo.stargazers_count >= 0 ? repo.stargazers_count : 0,
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    install: hasMarketplace ? `/plugin marketplace add ${repo.full_name}` : null,
  };
}

// Most-starred first, then alphabetical; capped.
export function finalizeSkills(items) {
  const sorted = items.filter(Boolean).sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
  return { generatedAt: new Date().toISOString(), source: SKILLS_SOURCE, items: sorted.slice(0, MAX_ITEMS) };
}

export function validateSkills(data) {
  assert(data && typeof data === 'object' && Array.isArray(data.items), 'skills: items must be an array');
  assert(data.items.length <= MAX_ITEMS, 'skills: too many items');
  for (const s of data.items) {
    assert(typeof s.name === 'string' && s.name.length > 0 && s.name.length <= NAME_LENGTH, 'skills: bad name');
    assert(typeof s.description === 'string' && s.description.length > 0 && s.description.length <= TEXT_LENGTH, 'skills: bad description');
    assert(httpsUrlOn(s.url, ['github.com']), `skills: bad url ${s.url}`);
    assert(httpsUrlOn(s.repoUrl, ['github.com']), `skills: bad repoUrl ${s.repoUrl}`);
    assert(typeof s.repo === 'string' && s.repo.length > 0 && s.repo.length <= NAME_LENGTH, 'skills: bad repo');
    assert(Number.isInteger(s.stars) && s.stars >= 0, 'skills: bad stars');
    assert(s.license === null || (typeof s.license === 'string' && s.license.length <= 40), 'skills: bad license');
    assert(s.install === null || (typeof s.install === 'string' && INSTALL_PATTERN.test(s.install)), 'skills: bad install');
  }
}

export async function fetchSkills({ token } = {}) {
  const get = async (url, accept) => fetchWithTimeout(url, { headers: githubHeaders(token, accept) });
  const repos = await (await get(SKILLS_SOURCE)).json();
  assert(Array.isArray(repos), 'skills: API payload is not an array');

  const items = [];
  for (const repo of repos.filter(r => r && !r.fork && !r.archived && !r.private)) {
    const tree = await (await get(`${API}/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`)).json();
    assert(Array.isArray(tree.tree), `skills: no tree for ${repo.full_name}`);
    if (tree.truncated) console.warn(`::warning::skills: tree of ${repo.full_name} is truncated; some skills may be missing`);
    const paths = tree.tree.filter(t => t.type === 'blob').map(t => t.path);
    const hasMarketplace = paths.includes('.claude-plugin/marketplace.json');
    for (const path of skillPaths(paths)) {
      const contentsUrl = `${API}/repos/${repo.full_name}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(repo.default_branch)}`;
      const markdown = await (await get(contentsUrl, 'application/vnd.github.raw+json')).text();
      const skill = normalizeSkill(repo, path, markdown, { hasMarketplace });
      if (skill) items.push(skill);
      else console.warn(`::warning::skills: skipped ${repo.full_name}/${path} (no name or description)`);
    }
  }
  const data = finalizeSkills(items);
  assert(data.items.length > 0, 'skills: no skills found in public repositories');
  return data;
}
