// Writes data/instagram.json as a placeholder fixture in the exact manifest shape
// from PLAN.md 4.6, using the clips from scripts/make-placeholders.sh.
// The real sync job (phase 3) overwrites this file. Every item is flagged placeholder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lqip = Object.fromEntries(
  readFileSync('assets/placeholders/lqip.tsv', 'utf8').trim().split('\n').map((l) => l.split('\t'))
);
const lanes = ['comedy', 'ads', 'sport', 'comedy', 'sport', 'ads', 'comedy', 'sport', 'ads'];
// Sample view counts: invented, clearly labelled "sample data" wherever shown.
const views = [182400, 64900, 311700, 47250, 128300, 93600, 256100, 71800, 39400];

const items = lanes.map((lane, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: `placeholder-${n}`,
    placeholder: true,
    permalink: 'https://www.instagram.com/barfainshtein/',
    timestamp: new Date(Date.UTC(2026, 9, 11 - i * 2)).toISOString(),
    caption: '',
    lane,
    has_video: true,
    video_url: `assets/placeholders/reel-${n}.mp4`,
    poster_url: `assets/placeholders/reel-${n}.webp`,
    lqip: lqip[n],
    width: 480,
    height: 854,
    duration: 5,
    views: views[i],
    likes: Math.round(views[i] * 0.041),
  };
});

const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: true,
  media_base_url: '',
  stats: {
    total_videos: items.length,
    total_views: items.reduce((a, b) => a + b.views, 0),
    missing_media_url: 0,
    missing_media_url_pct: 0,
  },
  hero: {
    landscape: { video_url: 'assets/placeholders/hero-loop.mp4', poster_url: 'assets/placeholders/hero-loop.webp', width: 1280, height: 720 },
    portrait: { video_url: 'assets/placeholders/hero-loop-portrait.mp4', poster_url: 'assets/placeholders/hero-loop-portrait.webp', width: 480, height: 854 },
    showreel: null,
  },
  items,
};

mkdirSync('data', { recursive: true });
writeFileSync('data/instagram.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync('data/overrides.json', JSON.stringify({ lanes: {}, hero: [] }, null, 2) + '\n');
console.log(`data/instagram.json: ${items.length} placeholder items, ${manifest.stats.total_views} sample views`);
