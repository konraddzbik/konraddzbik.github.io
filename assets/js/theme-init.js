// Loaded synchronously in <head> so the stored theme is applied before first paint (no flash).
(function () {
  var html = document.documentElement;
  var storedTheme = null;
  var dosMode = false;
  try {
    storedTheme = localStorage.getItem('theme');
    dosMode = localStorage.getItem('dosMode') === 'true';
  } catch (e) {
    // Storage can be blocked (private mode, strict privacy settings) — fall back to system preference.
  }
  var baseTheme = storedTheme === 'dark-theme' || storedTheme === 'light-theme'
    ? storedTheme
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark-theme' : 'light-theme');

  html.className = (dosMode ? 'dos-theme' : baseTheme) + ' js';
  html.setAttribute('data-base-theme', baseTheme);
})();
