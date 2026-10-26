(function () {
  'use strict';

  const html = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked — preference lasts for this page view only */ }
  }

  // Build an element with a class list and optional text content (never parses HTML).
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Accept only https URLs on an allow-listed host; anything else (javascript:, data:, foreign hosts) is dropped.
  function safeUrl(value, allowedHosts) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const ok = allowedHosts.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
      return ok ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function externalLink(href, className) {
    const a = el('a', className);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // === THEME SWITCHER (light / dark / DOS) ===
  const themeToggle = document.getElementById('theme-toggle');
  const dosToggle = document.getElementById('dos-toggle');
  const sun = document.getElementById('sun-icon');
  const moon = document.getElementById('moon-icon');
  const heroTitle = document.getElementById('hero-title');
  const dosPrompt = document.getElementById('dos-prompt');
  const dosBanner = document.getElementById('dos-banner');

  let baseTheme = html.getAttribute('data-base-theme') || 'light-theme';
  let dosMode = html.classList.contains('dos-theme');

  function applyTheme() {
    html.classList.remove('light-theme', 'dark-theme', 'dos-theme');
    html.classList.add(dosMode ? 'dos-theme' : baseTheme);
    html.setAttribute('data-base-theme', baseTheme);

    heroTitle.classList.toggle('dos-cursor', dosMode);
    dosPrompt.classList.toggle('hidden', !dosMode);
    dosBanner.classList.toggle('hidden', !dosMode);

    const isDark = baseTheme === 'dark-theme';
    sun.classList.toggle('hidden', !isDark || dosMode);
    moon.classList.toggle('hidden', isDark && !dosMode);

    dosToggle.setAttribute('aria-pressed', String(dosMode));
    themeToggle.disabled = dosMode;
    const themeLabel = dosMode
      ? 'Theme switching is unavailable in DOS mode'
      : (isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeToggle.setAttribute('aria-label', themeLabel);
    themeToggle.title = themeLabel;
  }
  applyTheme();

  themeToggle.addEventListener('click', () => {
    if (dosMode) return;
    baseTheme = baseTheme === 'light-theme' ? 'dark-theme' : 'light-theme';
    storageSet('theme', baseTheme);
    applyTheme();
  });

  dosToggle.addEventListener('click', () => {
    dosMode = !dosMode;
    storageSet('dosMode', String(dosMode));
    applyTheme();
  });

  // === HAMBURGER MENU ===
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  function setMenu(open) {
    mobileMenu.classList.toggle('open', open);
    hamburger.classList.toggle('hamburger-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    // Closed menu links must not be reachable by keyboard / screen readers.
    if (open) mobileMenu.removeAttribute('inert');
    else mobileMenu.setAttribute('inert', '');
  }

  hamburger.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
  mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
      setMenu(false);
      hamburger.focus();
    }
  });

  // === SCROLL REVEAL ===
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const children = entry.target.querySelectorAll('.glass, .glass-static, .stat-number');
      children.forEach((child, idx) => {
        child.style.transitionDelay = `${idx * 80}ms`;
        child.classList.add('reveal', 'active');
      });
      entry.target.classList.add('active');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(node => revealObserver.observe(node));

  // === ACTIVE NAV LINK ===
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        const active = link.getAttribute('href') === '#' + entry.target.id;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }, { threshold: 0.3, rootMargin: '-80px 0px -50% 0px' });

  sections.forEach(section => navObserver.observe(section));

  // === STAT COUNT-UP ===
  // Final values live in the HTML (correct without JS). Screen readers get a static copy;
  // the animated number is hidden from them so they never hear intermediate values.
  const stats = document.querySelectorAll('.stat-number[data-target]');
  stats.forEach(stat => {
    const srCopy = el('span', 'sr-only', stat.textContent.trim());
    stat.setAttribute('aria-hidden', 'true');
    stat.after(srCopy);
  });

  function format(stat, value) {
    return (stat.dataset.prefix || '') + value + (stat.dataset.suffix || '');
  }

  function animateStats(container) {
    container.querySelectorAll('.stat-number[data-target]').forEach(stat => {
      const target = parseInt(stat.dataset.target, 10);
      const duration = 1500;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        stat.textContent = format(stat, Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  if (!reducedMotion) {
    stats.forEach(stat => { stat.textContent = format(stat, 0); });
    document.querySelectorAll('#impact-stats, #stats').forEach(container => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          animateStats(entry.target);
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.5 });
      observer.observe(container);
    });
  }

  // === HERO CURSOR GLOW ===
  if (!reducedMotion && window.matchMedia('(hover: hover)').matches) {
    const hero = document.querySelector('.hero-gradient');
    const glow = document.getElementById('hero-glow');
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      glow.style.left = (e.clientX - rect.left) + 'px';
      glow.style.top = (e.clientY - rect.top) + 'px';
      glow.style.opacity = '1';
    });
    hero.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });
  }

  // === REMOTE CONTENT (GitHub repos, Medium articles) ===
  // All third-party data is rendered with textContent / validated attributes — never innerHTML.
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function showFallback(container, message, href, linkText) {
    container.replaceChildren();
    container.setAttribute('aria-busy', 'false');
    const p = el('p', 'col-span-full text-center text-secondary', message + ' ');
    const a = externalLink(href, 'text-indigo-600 dark-indigo-link font-semibold hover:underline');
    a.textContent = linkText;
    p.append(a);
    container.append(p);
  }

  const languageColors = { JavaScript: 'bg-yellow-400', TypeScript: 'bg-blue-600', Python: 'bg-blue-500', HTML: 'bg-orange-500' };

  function renderRepos(repos) {
    const grid = document.getElementById('projects-grid');
    const cards = repos
      .filter(r => r && !r.fork)
      .slice(0, 6)
      .map(r => {
        const href = safeUrl(r.html_url, ['github.com']);
        if (!href) return null;
        const card = externalLink(href, 'glass block p-5 rounded-xl');
        card.append(
          el('h3', 'font-bold text-lg text-primary line-clamp-2', r.name),
          el('p', 'text-sm text-secondary mt-1 line-clamp-2', r.description || 'No description')
        );
        const meta = el('div', 'flex justify-between mt-3 text-xs text-muted');
        const lang = el('span', 'flex items-center');
        const dot = el('span', 'w-3 h-3 rounded-full mr-1 ' + (languageColors[r.language] || 'bg-gray-400'));
        dot.setAttribute('aria-hidden', 'true');
        lang.append(dot, document.createTextNode(r.language || '—'));
        meta.append(lang, el('span', null, 'Stars: ' + Number(r.stargazers_count || 0)));
        card.append(meta);
        return card;
      })
      .filter(Boolean);

    if (!cards.length) throw new Error('no repositories');
    grid.replaceChildren(...cards);
    grid.setAttribute('aria-busy', 'false');
  }

  fetch('https://api.github.com/users/konraddzbik/repos?sort=updated&per_page=12')
    .then(r => { if (!r.ok) throw new Error('GitHub API ' + r.status); return r.json(); })
    .then(repos => { if (!Array.isArray(repos)) throw new Error('unexpected payload'); renderRepos(repos); })
    .catch(() => showFallback(document.getElementById('projects-grid'),
      'Projects could not be loaded right now.', 'https://github.com/konraddzbik', 'Browse them on GitHub →'));

  // Snapshot produced by scripts/fetch-articles.mjs (refreshed daily by GitHub Actions).
  function renderArticles(items) {
    const grid = document.getElementById('articles-grid');
    const cards = items.slice(0, 6).map(item => {
      const href = safeUrl(item.link, ['medium.com']);
      if (!href) return null;
      const imgSrc = item.image ? safeUrl(item.image, ['medium.com']) : null;
      const summary = String(item.summary || '').trim();

      const card = externalLink(href, 'glass article-card block rounded-xl overflow-hidden');
      const media = el('div', 'overflow-hidden');
      if (imgSrc) {
        const img = el('img', 'w-full h-48 object-cover');
        img.src = imgSrc;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = 400;
        img.height = 192;
        img.referrerPolicy = 'no-referrer';
        media.append(img);
      } else {
        media.append(el('div', 'article-placeholder w-full h-48'));
        media.firstChild.setAttribute('aria-hidden', 'true');
      }

      const body = el('div', 'p-5');
      body.append(
        el('h3', 'font-semibold text-lg text-primary line-clamp-2', item.title || 'Untitled'),
        el('p', 'text-sm text-secondary mt-2 line-clamp-3', summary || 'No description')
      );
      const date = item.published ? new Date(item.published) : null;
      if (date && !isNaN(date)) {
        const time = el('time', 'block text-xs text-muted mt-3', dateFormat.format(date));
        time.dateTime = date.toISOString().slice(0, 10);
        body.append(time);
      }
      card.append(media, body);
      return card;
    }).filter(Boolean);

    if (!cards.length) throw new Error('no articles');
    grid.replaceChildren(...cards);
    grid.setAttribute('aria-busy', 'false');
  }

  fetch('assets/data/articles.json')
    .then(r => { if (!r.ok) throw new Error('articles.json ' + r.status); return r.json(); })
    .then(d => { if (!d || !Array.isArray(d.items)) throw new Error('unexpected payload'); renderArticles(d.items); })
    .catch(() => showFallback(document.getElementById('articles-grid'),
      'Articles could not be loaded right now.', 'https://medium.com/@dzbik.konrad', 'Read them on Medium →'));
})();
