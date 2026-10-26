(function () {
  'use strict';

  const html = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hosts accepted for remote content. Article image hosts must match `img-src` in the CSP
  // and MEDIUM_IMAGE_HOSTS in scripts/lib/snapshot.mjs (checked by scripts/test/site.test.mjs).
  const GITHUB_HOSTS = ['github.com'];
  const MEDIUM_LINK_HOSTS = ['.medium.com'];
  const MEDIUM_IMAGE_HOSTS = ['cdn-images-1.medium.com', 'miro.medium.com'];

  // Each feature runs in isolation: a missing element or runtime error in one is logged
  // and never stops the others.
  function feature(name, init) {
    try {
      init();
    } catch (err) {
      console.error(`[${name}]`, err);
    }
  }

  function byId(id) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`#${id} not found`);
    return node;
  }

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

  // Accept only https URLs on an allow-listed host (exact match; a leading "." also allows
  // subdomains). Anything else — javascript:, data:, look-alike hosts — is dropped.
  function safeUrl(value, hosts) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      const ok = hosts.some(h => (h.startsWith('.') ? url.hostname === h.slice(1) || url.hostname.endsWith(h) : url.hostname === h));
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

  // === SCROLL REVEAL ===
  // Runs first. `reveal-ready` switches off the CSS failsafe that un-hides content if this
  // script never gets this far.
  feature('reveal', () => {
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
    html.classList.add('reveal-ready');
  });

  // === THEME SWITCHER (light / dark / DOS) ===
  feature('theme', () => {
    const themeToggle = byId('theme-toggle');
    const dosToggle = byId('dos-toggle');
    const sun = byId('sun-icon');
    const moon = byId('moon-icon');
    const heroTitle = byId('hero-title');
    const dosPrompt = byId('dos-prompt');
    const dosBanner = byId('dos-banner');

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
  });

  // === HAMBURGER MENU ===
  feature('menu', () => {
    const hamburger = byId('hamburger');
    const mobileMenu = byId('mobile-menu');

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
  });

  // === ACTIVE NAV LINK ===
  feature('nav', () => {
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

    document.querySelectorAll('section[id]').forEach(section => navObserver.observe(section));
  });

  // === STAT COUNT-UP ===
  // Final values live in the HTML (correct without JS). Screen readers get a static copy;
  // the animated number is hidden from them so they never hear intermediate values.
  feature('stats', () => {
    const stats = document.querySelectorAll('.stat-number[data-target]');
    stats.forEach(stat => {
      const srCopy = el('span', 'sr-only', stat.textContent.trim());
      stat.setAttribute('aria-hidden', 'true');
      stat.after(srCopy);
    });
    if (reducedMotion) return;

    const format = (stat, value) => (stat.dataset.prefix || '') + value + (stat.dataset.suffix || '');

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
  });

  // === HERO CURSOR GLOW ===
  feature('hero-glow', () => {
    if (reducedMotion || !window.matchMedia('(hover: hover)').matches) return;
    const hero = document.querySelector('.hero-gradient');
    const glow = byId('hero-glow');
    if (!hero) throw new Error('.hero-gradient not found');
    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      glow.style.left = (e.clientX - rect.left) + 'px';
      glow.style.top = (e.clientY - rect.top) + 'px';
      glow.style.opacity = '1';
    });
    hero.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });
  });

  // === REMOTE CONTENT (build-time snapshots of GitHub repos and Medium articles) ===
  // Snapshots are produced and validated by scripts/build.mjs; they are still treated as
  // untrusted here: rendered with textContent and validated attributes, never innerHTML.
  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const languageColors = { JavaScript: 'bg-yellow-400', TypeScript: 'bg-blue-600', Python: 'bg-blue-500', HTML: 'bg-orange-500' };

  function showFallback(grid, message, href, linkText) {
    grid.replaceChildren();
    grid.setAttribute('aria-busy', 'false');
    const p = el('p', 'col-span-full text-center text-secondary', message + ' ');
    const a = externalLink(href, 'text-indigo-600 dark-indigo-link font-semibold hover:underline');
    a.textContent = linkText;
    p.append(a);
    grid.append(p);
  }

  function loadSnapshot(name, gridId, renderCard, fallback) {
    feature(name, () => {
      const grid = byId(gridId);
      fetch(`assets/data/${name}.json`)
        .then(r => { if (!r.ok) throw new Error(`${name}.json ${r.status}`); return r.json(); })
        .then(data => {
          if (!data || !Array.isArray(data.items)) throw new Error('unexpected payload');
          const cards = data.items.slice(0, 6).map(renderCard).filter(Boolean);
          if (!cards.length) throw new Error(`no ${name}`);
          grid.replaceChildren(...cards);
          grid.setAttribute('aria-busy', 'false');
        })
        .catch(() => showFallback(grid, ...fallback));
    });
  }

  loadSnapshot('repos', 'projects-grid', (repo) => {
    const href = safeUrl(repo.url, GITHUB_HOSTS);
    if (!href) return null;
    const card = externalLink(href, 'glass block p-5 rounded-xl');
    card.append(
      el('h3', 'font-bold text-lg text-primary line-clamp-2', String(repo.name || '')),
      el('p', 'text-sm text-secondary mt-1 line-clamp-2', repo.description || 'No description')
    );
    const meta = el('div', 'flex justify-between mt-3 text-xs text-muted');
    const lang = el('span', 'flex items-center');
    const dot = el('span', 'w-3 h-3 rounded-full mr-1 ' + (languageColors[repo.language] || 'bg-gray-400'));
    dot.setAttribute('aria-hidden', 'true');
    lang.append(dot, document.createTextNode(repo.language || '—'));
    meta.append(lang, el('span', null, 'Stars: ' + Number(repo.stars || 0)));
    card.append(meta);
    return card;
  }, ['Projects could not be loaded right now.', 'https://github.com/konraddzbik', 'Browse them on GitHub →']);

  loadSnapshot('articles', 'articles-grid', (item) => {
    const href = safeUrl(item.link, MEDIUM_LINK_HOSTS);
    if (!href) return null;
    const imgSrc = item.image ? safeUrl(item.image, MEDIUM_IMAGE_HOSTS) : null;

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
      const placeholder = el('div', 'article-placeholder w-full h-48');
      placeholder.setAttribute('aria-hidden', 'true');
      media.append(placeholder);
    }

    const body = el('div', 'p-5');
    body.append(
      el('h3', 'font-semibold text-lg text-primary line-clamp-2', item.title || 'Untitled'),
      el('p', 'text-sm text-secondary mt-2 line-clamp-3', String(item.summary || '').trim() || 'No description')
    );
    const date = item.published ? new Date(item.published) : null;
    if (date && !isNaN(date)) {
      const time = el('time', 'block text-xs text-muted mt-3', dateFormat.format(date));
      time.dateTime = date.toISOString().slice(0, 10);
      body.append(time);
    }
    card.append(media, body);
    return card;
  }, ['Articles could not be loaded right now.', 'https://medium.com/@dzbik.konrad', 'Read them on Medium →']);
})();
