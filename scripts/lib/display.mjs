// The numbers a visitor actually sees, formatted exactly as the site formats them. scripts/build.mjs renders with
// compactFor(); scripts/ig-sync.mjs compares displaySignature() before and after a stats refresh, so a run commits
// only when a visible number changes (211K → 212K), not on every new view.
export const compactFor = (loc) => {
  const c0 = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 0 });
  const c1 = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  return (n) => (n >= 1e4 && n < 1e6 ? c0 : c1).format(n);
};

// Every displayed number in both languages: each visible Reel's views (cards, player), the featured (most viewed)
// Reel's views, the proof-row total, and the Reel counts.
export function displaySignature(manifest) {
  const items = (manifest.items || []).filter((i) => !i.placeholder);
  const visible = items.filter((i) => i.visible !== false);
  const featured = visible.reduce((a, b) => ((b.views ?? -1) > (a?.views ?? -1) ? b : a), null);
  const out = { videos: manifest.stats?.total_videos ?? items.length, shown: visible.length };
  for (const loc of ['he-IL', 'en-US']) {
    const f = compactFor(loc);
    out[loc] = {
      total: manifest.stats?.total_views == null ? '' : f(manifest.stats.total_views),
      top: featured?.views == null ? '' : f(featured.views),
      reels: Object.fromEntries(visible.map((i) => [i.id, i.views == null ? '' : f(i.views)])),
    };
  }
  return JSON.stringify(out);
}
