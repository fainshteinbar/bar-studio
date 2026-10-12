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
import { transcodeReel, transcodeFull, posterFrom, buildHeroLoops, laneFor, tempDir, probe } from './lib/media.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v26.0'}`;
const OUT = 'media/ig';
const MANIFEST = 'data/instagram.local.json';
const TRANSCODE = opt('--transcode', 1000);
const PREVIEW_SECONDS = 12; // rule 14: grid previews are the first 12 s

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

// 3. Visibility: data/reels.json lists media IDs Bar has hidden. Everything else is shown.
const hiddenCfg = (existsSync('data/reels.json') ? JSON.parse(readFileSync('data/reels.json', 'utf8')) : {}).hidden || {};
const visibility = (m) => (hiddenCfg[m.id] ? { status: 'hidden', reason: String(hiddenCfg[m.id] || 'hidden') } : { status: 'shown', reason: '' });

// 4. Posters for every video (the review page needs them all); renditions only for visible Reels.
mkdirSync(OUT, { recursive: true });
const overrides = existsSync('data/overrides.json') ? JSON.parse(readFileSync('data/overrides.json', 'utf8')) : {};
const items = [];
const tmp = tempDir('igsync');
let transcoded = 0;
try {
  for (const m of videos) {
    const vis = visibility(m);
    const prev = join(OUT, `${m.id}.mp4`), full = join(OUT, `${m.id}.full.mp4`);
    const webp = join(OUT, `${m.id}.webp`), lqFile = join(OUT, `${m.id}.lqip`);
    const want = vis.status === 'shown' && m.media_url && transcoded < TRANSCODE;
    const stale = existsSync(prev) && probe(prev).d > PREVIEW_SECONDS + 0.5;
    if (want && (!existsSync(prev) || !existsSync(full) || stale)) {
      const raw = join(tmp, `${m.id}.src.mp4`);
      await download(m.media_url, raw);
      transcodeReel(raw, prev, { maxSeconds: PREVIEW_SECONDS });
      transcodeFull(raw, full);
      writeFileSync(lqFile, posterFrom(prev, webp));
      rmSync(raw, { force: true });
    } else if (!existsSync(webp) && m.thumbnail_url) {
      const jpg = join(tmp, `${m.id}.jpg`);
      await download(m.thumbnail_url, jpg);
      writeFileSync(lqFile, posterFrom(jpg, webp, { isImage: true }));
    }
    const has_video = !!want && existsSync(prev) && existsSync(full);
    if (has_video) transcoded++;
    const p = has_video ? probe(full) : null;
    const pw = existsSync(webp) ? probe(webp) : { w: 720, h: 1280 };
    items.push({
      id: m.id, placeholder: false, permalink: m.permalink, timestamp: m.timestamp,
      caption: m.caption || '', lane: laneFor(m.caption, m.id, overrides.lanes || {}),
      visible: vis.status === 'shown' && has_video, status: vis.status, flag_reason: vis.reason,
      has_video, video_url: has_video ? `${OUT}/${m.id}.mp4` : null, full_url: has_video ? `${OUT}/${m.id}.full.mp4` : null,
      poster_url: existsSync(webp) ? `${OUT}/${m.id}.webp` : null, lqip: existsSync(lqFile) ? readFileSync(lqFile, 'utf8') : '',
      width: p ? p.w : pw.w, height: p ? p.h : pw.h, duration: p ? Math.round(p.d * 10) / 10 : null,
      views: await viewsFor(m.id), likes: m.like_count ?? null,
    });
    const it = items.at(-1);
    console.log(`${String(items.length).padStart(2, '0')} ${m.timestamp.slice(0, 10)} ${vis.status.padEnd(7)} ${has_video ? `${Math.round(statSync(prev).size / 1024)} KB preview, ${Math.round(statSync(full).size / 1024)} KB full` : '-'}  ${String(it.views ?? '-').padStart(7)} views  ${(m.caption || '').split('\n')[0].slice(0, 44)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 5. Hero loops from visible Reels only (override list first).
const playable = items.filter((i) => i.visible);
const heroIds = (overrides.hero || []).filter((id) => playable.some((i) => i.id === id));
const heroSrc = (heroIds.length >= 3 ? heroIds.map((id) => playable.find((i) => i.id === id)) : playable).slice(0, 9).map((i) => i.video_url);
const hero = heroSrc.length ? buildHeroLoops(heroSrc, OUT) : null;

const views = items.map((i) => i.views).filter((v) => typeof v === 'number');
const top = playable.reduce((a, b) => ((b.views ?? -1) > (a?.views ?? -1) ? b : a), null);
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
    top_visible_views: top?.views ?? null,
    top_visible_id: top?.id ?? null,
    shown: items.filter((i) => i.visible).length,
    hidden: items.filter((i) => i.status === 'hidden').length,
    missing_media_url: missing.length,
    missing_media_url_pct: videos.length ? Math.round((missing.length / videos.length) * 1000) / 10 : 0,
  },
  hero,
  items,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const s = manifest.stats;
console.log(`\nWrote ${MANIFEST}: ${items.length} Reels · ${s.shown} shown · ${s.hidden} hidden · hero ${hero ? 'built' : 'not built'}.`);
console.log(`Licensed-audio check: ${missing.length} of ${videos.length} videos returned no media_url (${s.missing_media_url_pct}%).`);
if (s.missing_media_url_pct > 25) console.log('Over 25%: the masters-folder fallback from PLAN.md 4.6 is recommended.');
