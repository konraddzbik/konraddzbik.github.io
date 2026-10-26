// Assembles the deployable site in _site/: copies an explicit allow-list of source files and
// writes the data snapshots. Tailwind CSS is built separately (npm run build:css) so the
// GitHub token used here never shares a process with npm packages.
//
//   node scripts/build.mjs          # GITHUB_TOKEN is optional (raises the API rate limit)
//   ALLOW_EMPTY_SNAPSHOT=1 node scripts/build.mjs   # offline / bootstrap only
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { snapshotWithFallback } from './lib/snapshot.mjs';
import { fetchArticles, validateArticles } from './lib/medium.mjs';
import { fetchRepos, validateRepos } from './lib/github.mjs';
import { fetchSkills, validateSkills } from './lib/skills.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, '_site');

// Everything published comes from this list (plus generated CSS/data). Nothing else in the
// repo — docs, tooling, editor files — can leak onto the site.
export const PUBLISHED_FILES = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  'assets/favicon.svg',
  'assets/headshot.jpg',
  'assets/headshot-240.jpg',
  'assets/js/main.js',
  'assets/js/theme-init.js',
];
export const GENERATED_FILES = ['assets/css/tailwind.css', 'assets/data/articles.json', 'assets/data/repos.json', 'assets/data/skills.json'];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  for (const file of PUBLISHED_FILES) {
    await mkdir(path.dirname(path.join(OUT, file)), { recursive: true });
    await cp(path.join(ROOT, file), path.join(OUT, file), { errorOnExist: true, force: false });
  }

  const token = process.env.GITHUB_TOKEN || undefined;
  const allowEmpty = process.env.ALLOW_EMPTY_SNAPSHOT === '1';
  const snapshots = [
    { name: 'articles', fetchLive: fetchArticles, validate: validateArticles },
    { name: 'repos', fetchLive: () => fetchRepos({ token }), validate: validateRepos },
    { name: 'skills', fetchLive: () => fetchSkills({ token }), validate: validateSkills },
  ];
  await mkdir(path.join(OUT, 'assets/data'), { recursive: true });
  for (const s of snapshots) {
    const { data, origin } = await snapshotWithFallback({ ...s, allowEmpty });
    await writeFile(path.join(OUT, `assets/data/${s.name}.json`), JSON.stringify(data, null, 2) + '\n');
    console.log(`${s.name}: ${data.items.length} items (${origin})`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
