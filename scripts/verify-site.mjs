// Final gate before upload: _site/ must contain exactly the allow-listed files, with valid
// data snapshots and a non-empty stylesheet.
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GENERATED_FILES, PUBLISHED_FILES } from './build.mjs';
import { validateArticles } from './lib/medium.mjs';
import { validateRepos } from './lib/github.mjs';
import { validateSkills } from './lib/skills.mjs';

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '_site');

async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) files.push(...await listFiles(path.join(dir, e.name), rel));
    else if (e.isFile()) files.push(rel);
    else throw new Error(`unexpected non-regular file in _site: ${rel}`);
  }
  return files;
}

const expected = new Set([...PUBLISHED_FILES, ...GENERATED_FILES]);
const actual = new Set(await listFiles(OUT));
const missing = [...expected].filter(f => !actual.has(f));
const extra = [...actual].filter(f => !expected.has(f));
if (missing.length || extra.length) {
  throw new Error(`_site mismatch — missing: [${missing}] unexpected: [${extra}]`);
}

validateArticles(JSON.parse(await readFile(path.join(OUT, 'assets/data/articles.json'), 'utf8')));
validateRepos(JSON.parse(await readFile(path.join(OUT, 'assets/data/repos.json'), 'utf8')));
validateSkills(JSON.parse(await readFile(path.join(OUT, 'assets/data/skills.json'), 'utf8')));
if ((await stat(path.join(OUT, 'assets/css/tailwind.css'))).size < 1024) {
  throw new Error('assets/css/tailwind.css is suspiciously small');
}
console.log(`_site verified: ${actual.size} files`);
