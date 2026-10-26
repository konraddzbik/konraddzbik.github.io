# konraddzbik.github.io

Personal homepage of Konrad Dżbik, served by GitHub Pages from `main`.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The page (hand-written HTML + a small `<style>` block) |
| `assets/css/tailwind.css` | **Generated** Tailwind build — do not edit by hand |
| `assets/js/theme-init.js` | Applies the saved theme in `<head>` before first paint |
| `assets/js/main.js` | Theme / menu / animations and the GitHub + Medium loaders |
| `assets/data/articles.json` | Medium feed snapshot, refreshed daily by GitHub Actions |
| `scripts/fetch-articles.mjs` | Builds `articles.json` from the Medium RSS feed |

## Editing

```sh
npm ci
npm run build:css        # after changing Tailwind classes in index.html or assets/js
npm run fetch:articles   # refresh the Medium snapshot locally
python3 -m http.server   # preview at http://localhost:8000
```

CI fails if `assets/css/tailwind.css` is out of date with the markup.
The page ships a Content-Security-Policy `<meta>` tag. When adding a new image host or API, allow it there.

See [`SECURITY-UX-AUDIT.md`](SECURITY-UX-AUDIT.md) for the latest audit.
