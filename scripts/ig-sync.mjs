// Instagram sync (PLAN.md 4.6). Reads Bar's own media through the Instagram API with Instagram Login,
// downloads Reels in the same run (media URLs expire), transcodes them, builds the hero loops and
// writes the manifest the site reads.
//
//   node scripts/ig-sync.mjs --local [--transcode 12]   local preview: media/ig/ + data/instagram.local.json (both gitignored)
//   node scripts/ig-sync.mjs --check                    token + account check only, downloads nothing
//
// Token: env IG_ACCESS_TOKEN, else the local file .secrets/ig-token (gitignored, chmod 600).
// The token is never printed; any URL that appears in an error is redacted.
// CDN upload (rclone remote "media", data/instagram.json) is phase 3 and not wired yet.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createWriteStream, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { transcodeReel, posterFrom, buildHeroLoops, laneFor, tempDir } from './lib/media.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v26.0'}`;
const OUT = 'media/ig';
const MANIFEST = 'data/instagram.local.json';
const TRANSCODE = opt('--transcode', 12);

const TOKEN = (process.env.IG_ACCESS_TOKEN || (existsSync('.secrets/ig-token') ? readFileSync('.secrets/ig-token', 'utf8') : '')).trim();
if (!TOKEN) {
  console.error('No token. Save it with the command from the setup steps (.secrets/ig-token), or set IG_ACCESS_TOKEN.');
  process.exit(2);
}
const redact = (s) => String(s).split(TOKEN).join('[token]').replace(/access_token=[^&\s"]+/g, 'access_token=[token]');

async function api(path, params = {}) {
  const u = new URL(path.startsWith('http') ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', TOKEN);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const hint = e.code === 190 ? ' The token is invalid or expired: generate a new one in the app dashboard.'
      : e.code === 10 || e.code === 200 ? ' Missing permission: check the scopes granted when the token was generated.' : '';
    throw new Error(redact(`Instagram API ${r.status} ${e.type || ''} code ${e.code ?? '?'}: ${e.message || 'request failed'}.${hint}`));
  }
  return j;
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}

const me = await api('/me', { fields: 'user_id,username,account_type,media_count' });
console.log(`Account: @${me.username} · type ${me.account_type || 'unknown'} · ${me.media_count ?? '?'} posts`);
if (has('--check')) {
  // Token age/expiry is not exposed by this API; the dashboard shows it. Report what we can.
  console.log('Token works. Media access OK:', !!(await api(`/${me.user_id || me.id}/media`, { fields: 'id', limit: '1' })).data);
  process.exit(0);
}
if (!has('--local')) {
  console.error('Only --local mode exists in this phase (CDN upload comes with R2 in phase 3).');
  process.exit(2);
}

// 1. List all media, newest first.
const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
let page = await api(`/${me.user_id || me.id}/media`, { fields, limit: '50' });
const all = [...page.data];
while (page.paging?.next) { page = await api(page.paging.next); all.push(...page.data); }
const videos = all.filter((m) => m.media_type === 'VIDEO');
const missing = videos.filter((m) => !m.media_url);
console.log(`Media: ${all.length} total, ${videos.length} videos, ${missing.length} without media_url (${videos.length ? Math.round((missing.length / videos.length) * 100) : 0}%).`);

// 2. Views (needs instagram_business_manage_insights; skipped quietly if not granted).
let insightsOk = true;
async function viewsFor(id) {
  if (!insightsOk) return null;
  try {
    const j = await api(`/${id}/insights`, { metric: 'views' });
    return j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value ?? null;
  } catch (e) {
    if (/code (10|200|100)\b/.test(e.message)) { insightsOk = false; console.log('Views: insights permission not granted, skipping view counts.'); return null; }
    throw e;
  }
}

// 3. Download + transcode the newest N videos that have media_url (incremental: reuse existing files).
mkdirSync(OUT, { recursive: true });
const overrides = existsSync('data/overrides.json') ? JSON.parse(readFileSync('data/overrides.json', 'utf8')) : {};
const items = [];
const tmp = tempDir('igsync');
try {
  for (const m of videos) {
    if (items.filter((i) => i.has_video).length >= TRANSCODE) break;
    const mp4 = join(OUT, `${m.id}.mp4`), webp = join(OUT, `${m.id}.webp`), lqFile = join(OUT, `${m.id}.lqip`);
    let has_video = false, dims = null;
    if (m.media_url) {
      if (!existsSync(mp4)) {
        const raw = join(tmp, `${m.id}.src.mp4`);
        await download(m.media_url, raw);
        dims = transcodeReel(raw, mp4);
        writeFileSync(lqFile, posterFrom(mp4, webp));
        rmSync(raw, { force: true });
      }
      has_video = true;
    } else if (m.thumbnail_url && !existsSync(webp)) {
      const jpg = join(tmp, `${m.id}.jpg`);
      await download(m.thumbnail_url, jpg);
      writeFileSync(lqFile, posterFrom(jpg, webp, { isImage: true }));
    }
    if (!existsSync(webp)) continue;
    const { w, h, d } = dims || (has_video ? (await import('./lib/media.mjs')).probe(mp4) : { w: 720, h: 1280, d: 0 });
    items.push({
      id: m.id, placeholder: false, permalink: m.permalink, timestamp: m.timestamp,
      caption: m.caption || '', lane: laneFor(m.caption, m.id, overrides.lanes || {}), has_video,
      video_url: has_video ? `${OUT}/${m.id}.mp4` : null, poster_url: `${OUT}/${m.id}.webp`,
      lqip: readFileSync(lqFile, 'utf8'), width: w, height: h, duration: Math.round(d * 10) / 10,
      views: await viewsFor(m.id), likes: m.like_count ?? null,
    });
    const kb = has_video ? Math.round(statSync(mp4).size / 1024) : 0;
    console.log(`${String(items.length).padStart(2, '0')} ${m.timestamp.slice(0, 10)} ${has_video ? `${w}x${h} ${kb} KB` : 'poster only (no media_url)'}  ${(m.caption || '').split('\n')[0].slice(0, 50)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 4. Hero loops from the newest playable reels (or the override list).
const playable = items.filter((i) => i.has_video);
const heroIds = (overrides.hero || []).filter((id) => playable.some((i) => i.id === id));
const heroSrc = (heroIds.length >= 3 ? heroIds.map((id) => playable.find((i) => i.id === id)) : playable).slice(0, 9).map((i) => i.video_url);
const hero = heroSrc.length ? buildHeroLoops(heroSrc, OUT) : null;

// Views across every video on the account (not only the transcoded ones).
const viewsById = Object.fromEntries(items.map((i) => [i.id, i.views]));
for (const m of videos) if (!(m.id in viewsById)) viewsById[m.id] = await viewsFor(m.id);
const views = Object.values(viewsById).filter((v) => typeof v === 'number');
const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: false,
  source: 'instagram api (local preview)',
  media_base_url: '',
  stats: {
    total_videos: videos.length,
    total_views: views.length ? views.reduce((a, b) => a + b, 0) : null,
    views_counted_over: views.length,
    views_sample: views.length === 0,
    missing_media_url: missing.length,
    missing_media_url_pct: videos.length ? Math.round((missing.length / videos.length) * 1000) / 10 : 0,
  },
  hero,
  items,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWrote ${MANIFEST}: ${items.length} items (${playable.length} playable), hero ${hero ? 'built' : 'not built'}.`);
console.log(`Licensed-audio check: ${missing.length} of ${videos.length} videos returned no media_url (${manifest.stats.missing_media_url_pct}%).`);
if (manifest.stats.missing_media_url_pct > 25) console.log('Over 25%: the masters-folder fallback from PLAN.md 4.6 is recommended.');
