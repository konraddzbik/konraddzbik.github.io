import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepos, validateRepos } from '../lib/github.mjs';
import { snapshotWithFallback } from '../lib/snapshot.mjs';

const repo = (over = {}) => ({
  name: 'termdesk', description: 'SSH client', html_url: 'https://github.com/konraddzbik/termdesk',
  language: 'TypeScript', stargazers_count: 3, fork: false, archived: false, private: false, ...over,
});

test('normalizeRepos drops forks, archived, private and non-GitHub URLs', () => {
  const data = normalizeRepos([
    repo(),
    repo({ name: 'fork', fork: true }),
    repo({ name: 'old', archived: true }),
    repo({ name: 'secret', private: true }),
    repo({ name: 'evil', html_url: 'javascript:alert(1)' }),
    repo({ name: 'evil2', html_url: 'https://github.com.evil.example/x' }),
  ]);
  assert.deepEqual(data.items.map(r => r.name), ['termdesk']);
  validateRepos(data);
});

test('normalizeRepos sanitizes fields and caps the list', () => {
  const data = normalizeRepos(Array.from({ length: 10 }, (_, i) => repo({ name: `r${i}`, description: '  a\n b  ', stargazers_count: -5, language: null })));
  assert.equal(data.items.length, 6);
  assert.deepEqual(data.items[0], { name: 'r0', description: 'a b', url: 'https://github.com/konraddzbik/termdesk', language: null, stars: 0 });
});

test('normalizeRepos rejects a non-array payload (e.g. rate-limit error)', () => {
  assert.throws(() => normalizeRepos({ message: 'API rate limit exceeded' }));
});

test('snapshotWithFallback never returns data that fails validation', async () => {
  const quiet = { warn() {} };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ name: '', url: 'javascript:x' }] }), { status: 200 });
  try {
    const result = await snapshotWithFallback({
      name: 'repos',
      fetchLive: async () => { throw new Error('down'); },
      validate: validateRepos,
      log: quiet,
    });
    assert.equal(result.origin, 'empty'); // deployed copy was invalid → not used
    assert.deepEqual(result.data.items, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('snapshotWithFallback prefers a valid deployed copy over an empty list', async () => {
  const deployed = { generatedAt: '2026-01-01T00:00:00.000Z', source: 'x', items: normalizeRepos([repo()]).items };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(deployed), { status: 200 });
  try {
    const result = await snapshotWithFallback({ name: 'repos', fetchLive: async () => ({ items: 'bad' }), validate: validateRepos, log: { warn() {} } });
    assert.equal(result.origin, 'deployed');
    assert.equal(result.data.items.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
