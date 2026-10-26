// Consistency checks between index.html, the browser script and the build allow-lists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { MEDIUM_IMAGE_HOSTS } from '../lib/snapshot.mjs';
import { PUBLISHED_FILES } from '../build.mjs';

const root = new URL('../../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const mainJs = await readFile(new URL('assets/js/main.js', root), 'utf8');

function csp() {
  const content = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(content, 'CSP meta tag present');
  return Object.fromEntries(content.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

test('CSP allows exactly the article image hosts the build and browser accept', () => {
  const imgSrc = csp()['img-src'];
  for (const host of MEDIUM_IMAGE_HOSTS) {
    assert.ok(imgSrc.includes(`https://${host}`), `img-src includes ${host}`);
    assert.ok(mainJs.includes(`'${host}'`), `main.js allow-lists ${host}`);
  }
  assert.ok(!imgSrc.some(s => s.includes('*')), 'no wildcard image hosts');
});

test('CSP keeps scripts and data same-origin', () => {
  const policy = csp();
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'self'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
});

test('page has no inline scripts other than JSON-LD', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map(m => m[1]);
  assert.deepEqual(inline, [' type="application/ld+json"']);
});

test('every mailto link uses the same address', () => {
  const addresses = new Set([...html.matchAll(/mailto:([^"?]+)/g)].map(m => m[1]));
  assert.deepEqual([...addresses], ['dzbik.konrad@gmail.com']);
});

test('every local asset referenced by index.html is published', async () => {
  const refs = [...html.matchAll(/(?:src|href)="((?:assets\/)[^"#?]+)"/g)].map(m => m[1]);
  const generated = new Set(['assets/css/tailwind.css']);
  for (const ref of refs) {
    if (generated.has(ref)) continue;
    assert.ok(PUBLISHED_FILES.includes(ref), `${ref} is in PUBLISHED_FILES`);
    await access(new URL(ref, root));
  }
});
