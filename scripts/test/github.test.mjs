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

function withFetch(body, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
  return fn().finally(() => { globalThis.fetch = originalFetch; });
}
const quiet = { warn() {} };
const NOW = Date.parse('2026-10-26T00:00:00.000Z');
const down = async () => { throw new Error('down'); };

test('snapshotWithFallback fails the build rather than publish invalid or empty data', async () => {
  await withFetch({ items: [{ name: '', url: 'javascript:x' }] }, async () => {
    await assert.rejects(
      snapshotWithFallback({ name: 'repos', fetchLive: down, validate: validateRepos, now: NOW, log: quiet }),
      /no valid snapshot/
    );
  });
});

test('snapshotWithFallback publishes an empty list only when bootstrapping is allowed', async () => {
  await withFetch({ items: 'bad' }, async () => {
    const result = await snapshotWithFallback({ name: 'repos', fetchLive: down, validate: validateRepos, allowEmpty: true, now: NOW, log: quiet });
    assert.equal(result.origin, 'empty');
    assert.deepEqual(result.data.items, []);
  });
});

test('snapshotWithFallback reuses a fresh, valid deployed copy', async () => {
  const deployed = { generatedAt: '2026-10-20T00:00:00.000Z', source: 'x', items: normalizeRepos([repo()]).items };
  await withFetch(deployed, async () => {
    const result = await snapshotWithFallback({ name: 'repos', fetchLive: async () => ({ items: 'bad' }), validate: validateRepos, now: NOW, log: quiet });
    assert.equal(result.origin, 'deployed');
    assert.equal(result.data.items.length, 1);
  });
});

test('snapshotWithFallback rejects a stale deployed copy (> 14 days)', async () => {
  const deployed = { generatedAt: '2026-09-01T00:00:00.000Z', source: 'x', items: normalizeRepos([repo()]).items };
  await withFetch(deployed, async () => {
    await assert.rejects(
      snapshotWithFallback({ name: 'repos', fetchLive: down, validate: validateRepos, now: NOW, log: quiet }),
      /stale/
    );
  });
});
