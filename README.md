# konraddzbik.github.io

Personal homepage of Konrad Dżbik. GitHub Actions builds it (`.github/workflows/site.yml`) and
deploys it to GitHub Pages on every push to `main`, daily (to refresh the GitHub and Medium
snapshots), and on demand.

> Pages source must be **GitHub Actions** (Settings → Pages).

## Structure

| Path | What it is |
|---|---|
| `index.html` | The page (hand-written HTML + a small `<style>` block) |
| `assets/js/theme-init.js` | Applies the saved theme in `<head>` before first paint |
| `assets/js/main.js` | Theme, menu, animations, and the repo/article cards |
| `scripts/build.mjs` | Copies the allow-listed files to `_site/` and writes the data snapshots |
| `scripts/lib/` | GitHub and Medium snapshot logic, plus validation and fallbacks |
| `scripts/verify-site.mjs` | Fails the build if `_site/` holds anything unexpected or invalid |
| `scripts/test/` | Unit and consistency tests (`npm test`) |
| `src/tailwind.css` | Tailwind entry point; the compiled CSS exists only in `_site/` |

## Working on it

```sh
npm ci
npm test
npm run preview   # build _site/ and serve it at http://127.0.0.1:8000
```

- **New file to publish?** Add it to `PUBLISHED_FILES` in `scripts/build.mjs`.
- **New image host or API?** Allow it in the CSP `<meta>` in `index.html` and in the matching
  allow-list. The tests check that they agree.

See [`SECURITY-UX-AUDIT.md`](SECURITY-UX-AUDIT.md) for the audit and the design decisions.
