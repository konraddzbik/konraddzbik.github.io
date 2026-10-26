# Website audit — security, accessibility, UI/UX

**Target:** https://konraddzbik.github.io (`index.html`, GitHub Pages, no build step)
**Date:** 2026-10-26 · **Baseline:** `main` @ `6f78b46`
**Method:** a security review of the source, focused on the trust boundaries a static page has
(third-party scripts, third-party JSON rendered into the DOM, outbound links). Automated
accessibility checks used axe-core 4.10 (WCAG 2.0/2.1 A + AA + best-practice) in headless Chrome
at 1280px and 375px, in light, dark and DOS themes. Scripted behavior tests covered XSS payloads,
JS disabled, `prefers-reduced-motion`, keyboard use of the mobile menu, theme persistence and
anchor offsets. No live endpoint was probed beyond normal page loads and one read of the public
RSS feed.

## Summary

| Area | Before (`main`) | After (this PR) |
|---|---|---|
| axe violations (desktop light) | 4 types — **1 critical**, 3 serious/moderate, 17 contrast nodes | **0** |
| axe violations (mobile DOS) | 5 types, 38 contrast nodes | **0** |
| Third-party script running with full page privileges | `cdn.tailwindcss.com` (dev-only Play CDN, unpinned, no SRI) | none |
| Content-Security-Policy | none | `script-src 'self'`, allow-listed `img`/`connect` |
| Third-party JSON rendered via `innerHTML` | 2 sources (GitHub API, rss2json) | 0 (DOM APIs + URL allow-list) |
| "Latest Articles" section | **Broken** — rss2json returns a Cloudflare challenge (403) | Works (same-origin snapshot, refreshed daily) |
| Page works without JavaScript | No (all sections `opacity:0`, stats read "0") | Yes |
| Console errors on load | CDN production warning + CORS errors | none |
| CSS shipped | ~300 KB JIT runtime, compiled in the browser | 14.5 KB static file |

## Security findings

Severity follows the skill's scale. A personal static site has a small blast radius, so nothing
here is high or critical. Even so, the first two findings let a third party run script on your
origin.

### S1 — Unpinned third-party script with full page privileges (medium)
`<script src="https://cdn.tailwindcss.com">` loads the Tailwind **Play CDN**. Tailwind documents it
as unfit for production. It is unversioned, so it can't carry Subresource Integrity. Whoever controls
that CDN response runs arbitrary JS on `konraddzbik.github.io`. It also logs a production warning on
every page view and compiles CSS in the browser, which causes a flash of unstyled content and costs
about 300 KB of JS.
**Fix:** Tailwind 3.4.17 (pinned) is compiled by the deploy workflow (`npm run build:css`), so the
live CSS always matches the markup.

### S2 — Third-party JSON written to the DOM with `innerHTML` (medium)
Both loaders used template strings with `innerHTML`, which is a DOM XSS sink:
- **Medium via `api.rss2json.com`** is a separate third party that sits between you and Medium.
  `title`, `link`, `pubDate` and the parsed `description` went straight into markup. `link` went into
  `href` unvalidated, so a `javascript:` URL would run on click. A compromised or misbehaving proxy
  meant script on your origin.
- **GitHub API:** `name` and `description` were interpolated into markup. You control your own repos,
  so this is lower risk, but it is the same sink.

**Fix:** cards are built with `createElement` and `textContent`. URLs must be `https:` on an
allow-listed host (`github.com`, `*.medium.com` for links, the two Medium image CDNs for images),
and anything else is dropped. A regression test fed
`<img onerror>`, `<script>` and `javascript:` payloads through both paths. No script ran, and the
hostile link and the off-allow-list image were dropped.

### S3 — No Content-Security-Policy (low, defense in depth)
GitHub Pages can't set response headers, so the CSP now ships as a `<meta>` tag. All inline JS moved
to `assets/js/`, which allows `script-src 'self'` with no `unsafe-inline`. `connect-src` is `'self'` only
(both data sources are same-origin snapshots), `img-src` lists exact hosts with no wildcards, and `object-src`,
`base-uri` and `form-action` are locked down. Limitations: `frame-ancestors` (clickjacking) and
`report-to` don't work in a meta CSP. `style-src` still needs `'unsafe-inline'` for the existing
`style=""` attributes.

### S4 — `target="_blank"` without `rel="noopener"` (informational)
Two certification links and all generated cards lacked `rel`. Modern browsers already imply
`noopener`, so the practical risk is small, but they now carry `rel="noopener noreferrer"`.

### S5 — Fragile third-party dependency (reliability, confirmed broken)
`api.rss2json.com` now answers with `403` and `cf-mitigated: challenge`. A cross-origin `fetch()`
can't pass that challenge, so the Articles section showed "Failed to load articles." on `main`.
**Fix:** the build snapshots the Medium feed (and the GitHub repo list) into same-origin JSON files
on every deploy and daily. This removes rss2json from the trust chain entirely. See *Review
follow-up* below for the final architecture.

### Not findings
No secrets in the repo, no forms, no cookies. `localStorage` holds only theme preferences, now wrapped
in `try/catch` so blocked storage doesn't break the page. Visitors' browsers no longer call the GitHub API at all,
so its 60 requests/hour/IP limit no longer applies.

## Accessibility (WCAG 2.1 AA)

| # | Issue | Fix |
|---|---|---|
| A1 | **Critical:** theme toggle and hamburger buttons had no accessible name | `aria-label`s that update with state (e.g. "Switch to light theme") |
| A2 | Footer icon-only social links had no accessible name | `aria-label` on each |
| A3 | Contrast failures: muted text 2.6:1, skill pills and CTA 4.2–4.5:1, green stat 2.5:1, badge text, DOS muted text | New tokens, all ≥ 4.5:1 (muted `#5b6577` light / `#94a3b8` dark, pills `#4f46e5`/`#4338ca`, CTA `#4f46e5→#7c3aed`, hero gradient darkened to ≥ 5.4:1 against white) |
| A4 | No skip link | "Skip to content" link, visible on focus |
| A5 | No visible custom focus style | `:focus-visible` ring for every theme |
| A6 | Closed mobile menu links still reachable by Tab | `inert` while closed, `aria-expanded`/`aria-controls`, Escape closes the menu and returns focus |
| A7 | No `prefers-reduced-motion` support (looping hero gradient, count-up, reveals, smooth scroll, blinking cursor) | All disabled under reduced motion |
| A8 | Count-up stats announced as "0" or intermediate values | Real values in the HTML; a static screen-reader copy, with the animated number hidden from assistive tech |
| A9 | `<aside>` nested in `<article>` (landmark error); no nav labels | Changed to `div`; `aria-label="Primary"`/`"Footer"` navs |
| A10 | 30 decorative SVGs exposed to assistive tech | `aria-hidden="true" focusable="false"` |
| A11 | DOS-mode theme button silently did nothing | Disabled with an explanation; DOS button has `aria-pressed` |

## UI / UX

| # | Issue | Fix |
|---|---|---|
| U1 | **Everything below the hero was invisible without JS** (`.reveal {opacity:0}`), and stats read "0" | Reveal applies only when the `.js` class is present; final values live in the markup; `<noscript>` links for projects and articles |
| U2 | Mobile hero social links overflowed at 375px (GitHub and Email clipped) | `flex-wrap` + `gap` |
| U3 | Theme flash for dark-mode users (theme applied after the body rendered) | `assets/js/theme-init.js` runs in `<head>` before first paint |
| U4 | Anchor jumps hid section headings under the fixed navbar | `scroll-padding-top: 5rem` |
| U5 | Non-clickable cards (stats, workshop articles, contact) lifted on hover, a false affordance | Hover lift only on links and cert cards |
| U6 | Error states were red "Failed to load …" text | Neutral message with a link to GitHub or Medium |
| U7 | Dead image placeholder `via.placeholder.com` (service shut down) | Branded CSS gradient placeholder |
| U8 | Date parsing: `new Date("YYYY-MM-DD HH:MM:SS")` gives Invalid Date in Safari; locale-dependent format | ISO dates from the snapshot, formatted `en-US` like the workshop cards |
| U9 | Forked repos shown as "your projects" | Forks filtered out |
| U10 | Images without dimensions (layout shift); 74 KB 637×900 headshot shown at 112px | `width`/`height` everywhere; 16 KB `headshot-240.jpg` for the hero |
| U11 | Favicon was an unstyled text glyph | `assets/favicon.svg` (brand indigo) |

## SEO / metadata

- The name was spelled **"Dzbik"** in `<title>`, meta, OG and JSON-LD but **"Dżbik"** on the page.
  It is now "Dżbik" everywhere, with `"alternateName": "Konrad Dzbik"` in JSON-LD so ASCII searches
  still match.
- Portrait `og:image` with `summary_large_image` produced a badly cropped card → `summary` card, plus
  `og:image:alt`, dimensions, `og:site_name`, `og:locale`.
- Added `robots.txt` and `sitemap.xml` (no hand-maintained `lastmod`). Removed `_config.yml`, which had
  a corrupted line and an unused remote theme; Jekyll is no longer part of the deploy.
- Invalid `<time datetime="TODO">` removed.

## Needs your input (not changed)

1. ~~Contact email~~ — fixed: all 4 links now use `dzbik.konrad@gmail.com` (the address in the git
   history), and a test enforces a single address.
2. **Mission 2 date** still reads "Date: TBD", although the LinkedIn recap was posted on
   2026-05-18 (decoded from the post ID). Add the real workshop date.
3. **Duplicated stats:** "195 people trained" and "+152%" appear in both the impact row and the
   Open mAIc row. Consider making the top row distinct, e.g. Open mAIc 195 + Eskadra participants.
4. Optional: put the site behind Cloudflare or another host that sets real headers, to get
   `frame-ancestors`, HSTS and a CSP report endpoint.

## Review follow-up (PR #1 review findings)

All 13 review findings were reproduced and fixed:

| # | Finding | Resolution |
|---|---|---|
| 1 | Snapshot picked Medium's 1×1 tracking pixel | `pickImage` skips 1×1 images and only accepts the two Medium image CDNs (unit-tested) |
| 2 | Scheduled refresh auto-disabled after 60 quiet days | `keepalive` job re-enables `site.yml` through the API on every scheduled run |
| 3 | Branch deploy shipped stale CSS before CI could fail | **Pages now deploys from a GitHub Actions build.** Generated CSS and data are no longer committed |
| 4 | Mutable action tags with a write token | Every action pinned to a commit SHA; Dependabot for actions and npm; `permissions: {}` by default with per-job least privilege; no job can write repo contents |
| 5 | A `main.js` failure blanked the page | Each feature is isolated (`feature()` + `byId()`), and a CSS failsafe reveals content after 2.5s unless `reveal-ready` was set |
| 6 | Placeholder contact email | Fixed (see above) |
| 7 | Image allow-list wider than the CSP | Exact hosts in the CSP, browser and build; a test keeps all three in sync |
| 8 | CI checkout and install hardening | `persist-credentials: false`, `npm ci --ignore-scripts` |
| 9 | "here ." spacing in summaries | Inline tags are stripped without spaces and punctuation is re-attached (unit-tested) |
| 10 | No fetch timeout | `AbortSignal.timeout(15s)` on every fetch; `timeout-minutes` on every job |
| 11 | Bot push races and skipped CI | No bot commits any more; snapshots are validated inside the build |
| 12 | Live, rate-limited GitHub API in the browser | Repos are snapshotted at build time with the workflow token; `connect-src 'self'` |
| 13 | Hard-coded sitemap `lastmod` | Removed |

**Build pipeline** (`.github/workflows/site.yml`, on push to `main`, daily, and on demand; PRs build
and test only):

1. `npm ci --ignore-scripts` → `npm test` (17 unit and consistency tests).
2. `node scripts/build.mjs` copies an **explicit allow-list** of files into `_site/` and snapshots
   GitHub and Medium. It uses Node built-ins only, so no npm package code runs while the token is set.
3. **Data integrity:** each snapshot is validated against a strict shape (https URLs on allow-listed
   hosts, length caps, ISO dates). If the live source fails or returns invalid data, the build falls
   back to the validated copy currently deployed, then to an empty list, which renders a link to the
   profile. Invalid data is never published.
4. `npm run build:css` → `scripts/verify-site.mjs`, which fails on any file in `_site/` that isn't
   expected, or on invalid data or empty CSS.
5. `deploy-pages` (deploy job only: `pages: write`, `id-token: write`).

## Maintaining it

- One-time, at merge: **Settings → Pages → Source: GitHub Actions**, or
  `gh api -X PUT repos/konraddzbik/konraddzbik.github.io/pages -f build_type=workflow`.
- Local preview: `npm ci && npm run preview` (builds `_site/` and serves it on http://127.0.0.1:8000).
- Publishing a new file? Add it to `PUBLISHED_FILES` in `scripts/build.mjs`. A test fails if
  `index.html` references an asset that isn't listed.
- New image host or API? Add it to the CSP `<meta>` in `index.html` and to the matching allow-list.
  `scripts/test/site.test.mjs` checks that they agree.
