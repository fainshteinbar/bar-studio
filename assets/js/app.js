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

    // Licensed-audio Reels (data-embed) play in Instagram's official embed: the iframe is created on open and removed
    // on close, so the page itself never loads anything from Instagram. "Open on Instagram" stays as the way out.
    let frame = null, tabbed = false;
    // A click inside the cross-origin embed moves focus into it, where Esc never reaches this page. When focus went
    // there by a click (not by Tab: keyboard users keep focus in the embed to operate it), it comes back to the
    // close button. The page sees no pointer events over the frame, so "the last key was not Tab" is the signal.
    addEventListener('keydown', (e) => { tabbed = e.key === 'Tab'; }, true);
    addEventListener('blur', () => {
      if (dlg.open && frame && !tabbed) setTimeout(() => { if (document.activeElement === frame) dlg.querySelector('.player-close').focus({ preventScroll: true }); }, 0);
    });
    const open = (a) => {
      if (!a || !(a.dataset.full || a.dataset.embed)) return false;
      opener = a;
      const embed = a.dataset.embed;
      dlg.classList.toggle('is-embed', !!embed);
      vid.hidden = !!embed;
      if (embed) {
        frame = document.createElement('iframe');
        frame.className = 'player-embed';
        frame.src = embed;
        frame.title = (a.dataset.pitch || '') + ' · Instagram';
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; clipboard-write; web-share';
        frame.allowFullscreen = true;
        frame.setAttribute('scrolling', 'no');
        vid.after(frame);
      } else {
        vid.poster = a.dataset.poster || '';
        vid.src = a.dataset.full;
      }
      pitch.textContent = a.dataset.pitch || '';
      pitch.lang = a.dataset.lang || '';
      pitch.dir = a.dataset.lang === 'he' ? 'rtl' : 'ltr';
      views.hidden = !a.dataset.views;
      views.querySelector('.ltr').textContent = a.dataset.views || '';
      ig.href = a.href || a.dataset.href;
      window.reels?.suspend(true);
      dlg.showModal();
      if (!embed) {
        vid.muted = false;
        const p = vid.play();
        if (p && p.catch) p.catch(() => { vid.muted = true; vid.play().catch(() => {}); });
      }
      history.pushState({ player: true }, '');
      pushed = true;
      return true;
    };
    const close = (fromHistory = false) => {
      if (!dlg.open) return;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      frame?.remove();
      frame = null;
      dlg.close();
      window.reels?.suspend(false);
      if (pushed && !fromHistory) history.back();
      pushed = false;
      opener?.focus({ preventScroll: true });
    };

    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-reel]');
      if (!a || e.defaultPrevented || e.button !== 0 || (a.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey))) return;
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
      const on = !!e.target.closest?.('[data-reel]') && !document.querySelector('dialog.player[open]') && !document.documentElement.classList.contains('is-dragging');
      if (on && !label.classList.contains('is-on')) { lx = x; ly = y; }
      label.classList.toggle('is-on', on);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    document.addEventListener('pointerleave', () => label.classList.remove('is-on'));
  }

  // Hovering a card gives its Reel priority under the playing cap.
  if (fine) {
    document.querySelectorAll('.card a, .feat-media, .row-card').forEach((a) => {
      const v = a.querySelector('video');
      if (!v) return;
      a.addEventListener('pointerenter', () => window.reels?.prefer(v));
      a.addEventListener('pointerleave', () => window.reels?.prefer(null));
    });
  }

  // Rows from 600 px: the CSS size (grid card or window fit) can leave the next card barely visible or almost whole.
  // Shrink the cards a little (at most about 10%) so a clear part of the next one always peeks. The rows are below the
  // first screen, so this never moves anything in view.
  const rowsEl = document.querySelector('.rows');
  const fitPeek = () => {
    if (!rowsEl) return;
    rowsEl.style.removeProperty('--card');
    if (innerWidth < 600) return;
    const probe = rowsEl.querySelector('.row:not(.row-top) .row-item');
    if (!probe) return;
    const cs = getComputedStyle(probe.parentElement);
    const card = probe.getBoundingClientRect().width, gap = parseFloat(cs.columnGap) || 16, pad = parseFloat(cs.paddingInlineStart) || 0;
    const slots = (innerWidth - pad + gap) / (card + gap), n = Math.floor(slots), frac = slots - n;
    if (frac >= 0.15 && frac <= 0.86) return;
    const target = frac < 0.15 ? n + 0.3 : n + 1.3;   // always more slots than now: the cards only shrink
    rowsEl.style.setProperty('--card', `${Math.floor((innerWidth - pad + gap) / target - gap)}px`);
  };
  fitPeek();
  let fitQueued = 0;
  addEventListener('resize', () => { cancelAnimationFrame(fitQueued); fitQueued = requestAnimationFrame(fitPeek); }, { passive: true });

  // Rows: previous/next arrows (fine pointers; hidden at either end), and a focused card is scrolled into its strip.
  // scrollLeft is 0 at the inline start and grows negative toward the end in RTL, so the sign follows the direction.
  document.querySelectorAll('.row').forEach((row) => {
    const strip = row.querySelector('.row-strip');
    const prev = row.querySelector('.row-prev'), next = row.querySelector('.row-next');
    if (!strip) return;
    const sign = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
    const behavior = reduce ? 'auto' : 'smooth';
    const wrap = strip.parentElement, pages = row.querySelector('.row-pages');
    // Page dashes (one per screenful) and the edge fades follow the scroll position.
    const update = () => {
      const pos = Math.abs(strip.scrollLeft), max = strip.scrollWidth - strip.clientWidth;
      prev?.setAttribute('aria-disabled', String(pos <= 2));
      next?.setAttribute('aria-disabled', String(pos >= max - 2));
      wrap.classList.toggle('is-moved', pos > 2);
      wrap.classList.toggle('is-end', pos >= max - 2);
      if (!pages) return;
      const n = max > 2 ? Math.ceil(strip.scrollWidth / strip.clientWidth - 0.05) : 0;
      if (pages.childElementCount !== n) pages.innerHTML = '<i></i>'.repeat(n);
      const cur = max > 2 ? Math.round((pos / max) * (n - 1)) : 0;
      [...pages.children].forEach((d, k) => d.classList.toggle('on', k === cur));
    };
    const go = (d) => strip.scrollBy({ left: d * sign * strip.clientWidth * 0.85, behavior });
    prev?.addEventListener('click', () => prev.getAttribute('aria-disabled') !== 'true' && go(-1));
    next?.addEventListener('click', () => next.getAttribute('aria-disabled') !== 'true' && go(1));
    let queued = false;
    strip.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
    // Mouse drag: the strip follows the pointer (no snapping meanwhile), then snaps to the nearest card. A drag never
    // counts as a click on the card it started on. Touch and pen keep the browser's own swiping.
    let drag = null;
    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: strip.scrollLeft, moved: false, id: e.pointerId };
    });
    strip.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; strip.setPointerCapture(e.pointerId); strip.classList.add('is-dragging'); document.documentElement.classList.add('is-dragging'); }
      strip.scrollLeft = drag.left - dx;
    });
    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      strip.classList.remove('is-dragging');
      document.documentElement.classList.remove('is-dragging');
      // Swallow the click that follows the release; snapping resumes once the class is gone.
      const swallow = (c) => { c.preventDefault(); c.stopPropagation(); };
      strip.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => strip.removeEventListener('click', swallow, { capture: true }), 0);
    };
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);
    strip.addEventListener('dragstart', (e) => e.preventDefault());
    strip.addEventListener('focusin', (e) => {
      const item = e.target !== strip && e.target.closest('.row-item');
      if (item) item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
    });
    // Also when a row skipped by content-visibility gets its real size.
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(strip); else addEventListener('resize', update, { passive: true });
    update();
  });
})();
