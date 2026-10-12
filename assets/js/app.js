// Direction 6 interactions: watch-with-sound player, magnetic CTAs, count-up proof, hover priority.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const EASE_UI = 'cubic-bezier(0.23, 1, 0.32, 1)';

  // Player overlay (rule 7): native <dialog> gives the focus trap and Esc; back button closes too.
  const dlg = document.querySelector('dialog.player');
  if (dlg) {
    const vid = dlg.querySelector('.player-video');
    const pitch = dlg.querySelector('.player-pitch');
    const views = dlg.querySelector('.player-views');
    const ig = dlg.querySelector('.player-ig');
    let opener = null;
    let pushed = false;

    const open = (a) => {
      if (!a || !a.dataset.full) return false;
      opener = a;
      vid.poster = a.dataset.poster || '';
      vid.src = a.dataset.full;
      pitch.textContent = a.dataset.pitch || '';
      pitch.lang = a.dataset.lang || '';
      pitch.dir = a.dataset.lang === 'he' ? 'rtl' : 'ltr';
      views.hidden = !a.dataset.views;
      views.querySelector('.ltr').textContent = a.dataset.views || '';
      ig.href = a.href;
      window.reels?.suspend(true);
      dlg.showModal();
      vid.muted = false;
      const p = vid.play();
      if (p && p.catch) p.catch(() => { vid.muted = true; vid.play().catch(() => {}); });
      history.pushState({ player: true }, '');
      pushed = true;
      return true;
    };
    const close = (fromHistory = false) => {
      if (!dlg.open) return;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      dlg.close();
      window.reels?.suspend(false);
      if (pushed && !fromHistory) history.back();
      pushed = false;
      opener?.focus({ preventScroll: true });
    };

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-reel]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (open(a)) e.preventDefault();
    });
    document.querySelector('[data-open-featured]')?.addEventListener('click', () => open(document.querySelector('.feat-media')));
    dlg.querySelector('.player-close').addEventListener('click', () => close());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    addEventListener('popstate', () => close(true));
  }

  // Magnetic CTAs (rule 12): fine pointers only, 0.2x pull, label at half, one overshoot on release.
  if (fine && !reduce) {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const inner = el.querySelector('.pill-in');
      let dx = 0, dy = 0;
      const set = (x, y) => {
        el.style.transform = `translate(${x}px, ${y}px)`;
        if (inner) inner.style.transform = `translate(${x * 0.5}px, ${y * 0.5}px)`;
      };
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        dx = (e.clientX - (r.left + r.width / 2)) * 0.2;
        dy = (e.clientY - (r.top + r.height / 2)) * 0.2;
        set(dx, dy);
      });
      el.addEventListener('pointerleave', () => {
        const kf = (x, y) => [
          { transform: `translate(${x}px, ${y}px)` },
          { transform: `translate(${-x * 0.1}px, ${-y * 0.1}px)`, offset: 0.6 },
          { transform: 'translate(0, 0)' },
        ];
        el.animate(kf(dx, dy), { duration: 500, easing: EASE_UI });
        inner?.animate(kf(dx * 0.5, dy * 0.5), { duration: 500, easing: EASE_UI });
        el.style.transform = '';
        if (inner) inner.style.transform = '';
        dx = dy = 0;
      });
    });
  }

  // Count-up for the proof numbers, once, when they come into view.
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    const fmt = new Intl.NumberFormat(document.documentElement.lang === 'he' ? 'he-IL' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 });
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const el = e.target, end = +el.dataset.count, final = el.textContent, t0 = performance.now();
        if (!end) continue;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / 700);
          const v = Math.round(end * ease(k));
          el.textContent = k < 1 ? (end >= 1000 ? fmt.format(v) : String(v)) : final;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.6 });
    counters.forEach((c) => io.observe(c));
  }

  // Cursor label over any Reel: eased follow (Dennis-level craft, our own form). Fine pointers only.
  if (fine && !reduce) {
    const label = document.createElement('span');
    label.className = 'cursor-label';
    label.setAttribute('aria-hidden', 'true');
    label.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>' + (document.documentElement.lang === 'he' ? 'צפו עם סאונד' : 'Watch with sound');
    document.body.appendChild(label);
    document.documentElement.classList.add('has-cursor-label');
    let x = 0, y = 0, lx = 0, ly = 0, raf = 0;
    const tick = () => {
      lx += (x - lx) * 0.18; ly += (y - ly) * 0.18;
      label.style.transform = `translate(${lx + 18}px, ${ly + 18}px)`;
      raf = Math.abs(x - lx) + Math.abs(y - ly) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      const on = !!e.target.closest?.('[data-reel]') && !document.querySelector('dialog.player[open]');
      if (on && !label.classList.contains('is-on')) { lx = x; ly = y; }
      label.classList.toggle('is-on', on);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.addEventListener('pointerleave', () => label.classList.remove('is-on'));
  }

  // Hovering a card gives its Reel priority under the playing cap.
  if (fine) {
    document.querySelectorAll('.card a, .feat-media').forEach((a) => {
      const v = a.querySelector('video');
      if (!v) return;
      a.addEventListener('pointerenter', () => window.reels?.prefer(v));
      a.addEventListener('pointerleave', () => window.reels?.prefer(null));
    });
  }
})();
