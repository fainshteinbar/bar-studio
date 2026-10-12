// Shared video controller (phase 2 directions and the phase 3 site).
// - Videos have preload="none" and no src until they are at least half visible.
// - Grid videos are capped: 2 playing on narrow screens, 4 otherwise. The top-most
//   visible ones win; the rest keep their poster.
// - Hero videos (data-hero) play whenever visible and do not count toward the cap.
// - Posters and video start after the load event AND the first paint, then at idle: on slow CPUs the first
//   frame can come after load, and video decode would otherwise compete with it (and with LCP).
// - prefers-reduced-motion or Save-Data: nothing autoplays, posters stay.
(() => {
  const afterFirstPaint = (fn) => {
    const go = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
    const wait = () => {
      if (performance.getEntriesByType('paint').length) return go();
      try { new PerformanceObserver((l, o) => { o.disconnect(); go(); }).observe({ type: 'paint', buffered: true }); } catch { setTimeout(go, 1000); }
    };
    if (document.readyState === 'complete') wait(); else addEventListener('load', wait, { once: true });
  };

  // Deferred posters (below the first screen): real poster replaces the inline LQIP after load, near the viewport.
  const lazyPosters = [...document.querySelectorAll('img[data-poster]')];
  const loadPoster = (img) => { if (img.dataset.poster) { img.src = img.dataset.poster; delete img.dataset.poster; } };
  const startPosters = () => {
    if (!('IntersectionObserver' in window)) return lazyPosters.forEach(loadPoster);
    const pio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { loadPoster(e.target); pio.unobserve(e.target); } }), { rootMargin: '800px 0px' });
    lazyPosters.forEach((img) => pio.observe(img));
  };
  afterFirstPaint(startPosters);

  const vids = [...document.querySelectorAll('video[data-src], video[data-src-landscape]')];
  if (!vids.length) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  if (reduce || saveData) {
    document.documentElement.classList.add('reels-static');
    return;
  }

  const narrow = matchMedia('(max-width: 700px)');
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const cap = () => (narrow.matches ? 2 : 4);
  const visible = new Set();
  let preferred = null; // set by window.reels.prefer(video), e.g. on card hover
  let suspended = false; // set while an overlay player is open
  const isHero = (v) => 'hero' in v.dataset;
  const srcFor = (v) => v.dataset.src || (portrait.matches ? v.dataset.srcPortrait : v.dataset.srcLandscape);

  function play(v) {
    const src = srcFor(v);
    if (v.getAttribute('src') !== src) v.setAttribute('src', src);
    if (v.paused) {
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // Decide from the current visible set, never from individual entries: an observer
  // batch can hold stale entries from intermediate scroll positions.
  function reconcile() {
    if (document.hidden || suspended) { vids.forEach((v) => v.pause()); return; }
    const grid = [...visible].filter((v) => !isHero(v))
      .sort((a, b) => (b === preferred) - (a === preferred) || a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .slice(0, cap());
    const want = new Set([...grid, ...[...visible].filter(isHero)]);
    vids.forEach((v) => (want.has(v) ? play(v) : v.paused || v.pause()));
  }

  vids.forEach((v) => {
    v.addEventListener('playing', () => v.classList.add('is-playing'));
    v.addEventListener('pause', () => v.classList.remove('is-playing'));
  });

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; reconcile(); });
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
      schedule();
    },
    { threshold: 0.5 }
  );

  portrait.addEventListener('change', schedule);
  narrow.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);

  window.reels = { prefer(v) { preferred = v && visible.has(v) ? v : null; schedule(); }, suspend(on) { suspended = !!on; schedule(); } };

  afterFirstPaint(() => vids.forEach((v) => io.observe(v)));
})();
