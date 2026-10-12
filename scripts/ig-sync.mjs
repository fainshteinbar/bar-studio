// Instagram sync (PLAN.md 4.6). Reads Bar's own Reels through the Instagram API with Instagram Login,
// downloads new ones in the same run (Instagram media URLs expire), makes three renditions + a poster,
// translates new captions, and writes the manifest the site is built from.
//
//   node scripts/ig-sync.mjs --upload [--force]   production (CI): media to Bunny Storage, manifest data/instagram.json
//   node scripts/ig-sync.mjs --local              local preview: media/ig/ + data/instagram.local.json (both gitignored)
//   node scripts/ig-sync.mjs --check              token + account check only
//   node scripts/ig-sync.mjs --upload --detect     hourly gate: is there anything to do? (writes changed=true|false
//                                                 to GITHUB_OUTPUT; two API calls, no downloads)
//
// Upload mode is incremental against the committed manifest. It exits before any download, upload,
// translation or manifest write unless a Reel was added or removed, a caption was edited, the hidden list
// changed, a Reel's media became available, or an English caption is still pending (or --force). View
// counts alone never trigger a run; they refresh whenever one of those happens. New Reels (or --force) are
// downloaded, transcoded and uploaded; Reels already on the CDN are reused.
//
// Env: IG_ACCESS_TOKEN (else .secrets/ig-token locally), IG_API_VERSION (default v26.0),
//      upload mode: BUNNY_STORAGE_PASSWORD (secret), BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST, MEDIA_BASE_URL,
//      translation: GEMINI_API_KEY (Gemini free tier; without it new English captions stay empty, never Hebrew).
// Secrets are never printed; any URL that appears in an error is redacted.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync, createWriteStream, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { transcodeReel, transcodeFull, posterFrom, laneFor, tempDir, probe, brightness } from './lib/media.mjs';
import { readTranslations, writeTranslations, captionHash, isHebrew, pitchOf } from './lib/captions.mjs';
import { translateMissing } from './lib/translate.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const UPLOAD = has('--upload');
const LOCAL = has('--local');
const DETECT = has('--detect');
const API = `https://graph.instagram.com/${process.env.IG_API_VERSION || 'v26.0'}`;
const PREVIEW_SECONDS = 12; // rule 14: grid previews are the first 12 s
const MANIFEST = UPLOAD ? 'data/instagram.json' : 'data/instagram.local.json';

const TOKEN = (process.env.IG_ACCESS_TOKEN || (existsSync('.secrets/ig-token') ? readFileSync('.secrets/ig-token', 'utf8') : '')).trim();
if (!TOKEN) { console.error('No Instagram token (IG_ACCESS_TOKEN).'); process.exit(2); }

const BUNNY = {
  password: process.env.BUNNY_STORAGE_PASSWORD || '',
  zone: process.env.BUNNY_STORAGE_ZONE || '',
  host: (process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  base: (process.env.MEDIA_BASE_URL || '').replace(/\/$/, ''),
};
if (UPLOAD && !DETECT && (!BUNNY.password || !BUNNY.zone || !BUNNY.base)) {
  console.error('Upload mode needs BUNNY_STORAGE_PASSWORD, BUNNY_STORAGE_ZONE and MEDIA_BASE_URL.');
  process.exit(2);
}
const SECRETS = [TOKEN, BUNNY.password, process.env.GEMINI_API_KEY].filter(Boolean);
const redact = (s) => SECRETS.reduce((acc, x) => acc.split(x).join('[secret]'), String(s)).replace(/access_token=[^&\s"]+/g, 'access_token=[secret]');

async function api(path, params = {}) {
  const u = new URL(path.startsWith('http') ? path : `${API}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', TOKEN);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const hint = e.code === 190 ? ' The token is invalid or expired: generate a new one in the Meta app dashboard.'
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

const TYPES = { '.mp4': 'video/mp4', '.webp': 'image/webp' };
async function bunnyPut(localFile, remotePath) {
  const ext = remotePath.slice(remotePath.lastIndexOf('.'));
  const r = await fetch(`https://${BUNNY.host}/${BUNNY.zone}/${remotePath}`, {
    method: 'PUT',
    headers: { AccessKey: BUNNY.password, 'Content-Type': TYPES[ext] || 'application/octet-stream' },
    body: readFileSync(localFile),
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(redact(`Bunny upload failed for ${remotePath}: HTTP ${r.status}`));
}

const me = await api('/me', { fields: 'user_id,username,account_type,media_count' });
console.log(`Account: @${me.username} · type ${me.account_type || 'unknown'} · ${me.media_count ?? '?'} posts`);
if (has('--check')) {
  console.log('Token works. Media access OK:', !!(await api(`/${me.user_id || me.id}/media`, { fields: 'id', limit: '1' })).data);
  process.exit(0);
}
if (!UPLOAD && !LOCAL) { console.error('Choose --upload (CI) or --local (preview).'); process.exit(2); }

// 1. All media, newest first; Reels are the VIDEO items.
const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
let page = await api(`/${me.user_id || me.id}/media`, { fields, limit: '50' });
const all = [...page.data];
while (page.paging?.next) { page = await api(page.paging.next); all.push(...page.data); }
const videos = all.filter((m) => m.media_type === 'VIDEO');
const missing = videos.filter((m) => !m.media_url);
console.log(`Media: ${all.length} total, ${videos.length} videos, ${missing.length} without media_url.`);

const hiddenCfg = (existsSync('data/reels.json') ? JSON.parse(readFileSync('data/reels.json', 'utf8')) : {}).hidden || {};
const overrides = existsSync('data/overrides.json') ? JSON.parse(readFileSync('data/overrides.json', 'utf8')) : {};
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { items: [] };
const prevById = Object.fromEntries((previous.items || []).filter((i) => !i.placeholder).map((i) => [i.id, i]));

// 1b. Early exit (hourly schedule): stop here unless something a visitor would see has changed.
const reasons = [];
if (UPLOAD && !has('--force')) {
  const cache = readTranslations();
  const ids = new Set(videos.map((m) => m.id));
  for (const m of videos) {
    const prev = prevById[m.id], hidden = !!hiddenCfg[m.id];
    if (!prev) { reasons.push(`new Reel ${m.id}`); continue; }
    if ((m.caption || '') !== (prev.caption || '')) reasons.push(`caption edited ${m.id}`);
    if ((prev.status === 'hidden') !== hidden) reasons.push(`visibility changed ${m.id}`);
    if (!hidden && !prev.has_video && m.media_url) reasons.push(`media now available ${m.id}`);
    if (!hidden && prev.has_video && !overrides.captions_en?.[m.id]) {
      const src = pitchOf(m.caption);
      if ((isHebrew(src.pitch) || isHebrew(src.more)) && cache.items?.[m.id]?.hash !== captionHash(m.caption)) reasons.push(`English caption pending ${m.id}`);
    }
  }
  for (const id of Object.keys(prevById)) if (!ids.has(id)) reasons.push(`Reel removed ${id}`);
}
const changed = !UPLOAD || has('--force') || reasons.length > 0;
console.log(has('--force') ? 'Forced run.' : reasons.length ? `Work to do: ${reasons.join('; ')}.` : 'No new or changed Reels: nothing to download, upload, translate or commit.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
if (DETECT || !changed) process.exit(0);

// 2. Views (instagram_business_manage_insights); skipped if not granted.
let insightsOk = true;
async function viewsFor(id) {
  if (!insightsOk) return null;
  try {
    const j = await api(`/${id}/insights`, { metric: 'views' });
    return j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value ?? null;
  } catch (e) {
    if (/code (10|200|100)\b/.test(e.message)) { insightsOk = false; console.log('Views: insights permission not granted, skipping.'); return null; }
    throw e;
  }
}

// 3. Visibility (data/reels.json, read above): media IDs Bar has hidden.

// 4. Renditions + poster for each visible Reel that is new (or --force); reuse everything else.
const OUT = LOCAL ? 'media/ig' : tempDir('igsync-out');
mkdirSync(OUT, { recursive: true });
const urlFor = (name) => (UPLOAD ? `${BUNNY.base}/reels/${name}` : `${OUT}/${name}`);
const tmp = tempDir('igsync');
const items = [];
let processed = 0, reused = 0;
try {
  for (const m of videos) {
    const hidden = !!hiddenCfg[m.id];
    const prev = prevById[m.id];
    const reusable = UPLOAD && !has('--force') && prev?.has_video && prev.video_url?.startsWith(BUNNY.base);
    const localReady = LOCAL && existsSync(join(OUT, `${m.id}.mp4`)) && existsSync(join(OUT, `${m.id}.full.mp4`)) && existsSync(join(OUT, `${m.id}.rail.mp4`)) && existsSync(join(OUT, `${m.id}.webp`));
    let entry;
    if (hidden) {
      entry = { has_video: false };
    } else if (reusable || localReady) {
      entry = reusable ? { ...prev } : JSON.parse(readFileSync(join(OUT, `${m.id}.json`), 'utf8'));
      reused++;
    } else if (m.media_url) {
      const raw = join(tmp, `${m.id}.src.mp4`);
      const prevMp4 = join(OUT, `${m.id}.mp4`), fullMp4 = join(OUT, `${m.id}.full.mp4`), railMp4 = join(OUT, `${m.id}.rail.mp4`), webp = join(OUT, `${m.id}.webp`);
      await download(m.media_url, raw);
      transcodeReel(raw, prevMp4, { maxSeconds: PREVIEW_SECONDS });
      const full = transcodeFull(raw, fullMp4);
      transcodeReel(prevMp4, railMp4, { maxSeconds: 6, width: 360, crf: 31 });
      // Poster: the cover Bar chose on Instagram; a picked video frame if there is no cover or it is near-black.
      let lqip;
      if (m.thumbnail_url) {
        const jpg = join(tmp, `${m.id}.jpg`);
        await download(m.thumbnail_url, jpg);
        lqip = posterFrom(jpg, webp, { isImage: true });
      }
      if (!lqip || brightness(webp) < 12) lqip = posterFrom(prevMp4, webp, { pick: true });
      rmSync(raw, { force: true });
      if (UPLOAD) {
        for (const f of [prevMp4, fullMp4, railMp4, webp]) await bunnyPut(f, `reels/${f.split('/').pop()}`);
      }
      const pw = probe(webp);
      entry = {
        has_video: true,
        video_url: urlFor(`${m.id}.mp4`), full_url: urlFor(`${m.id}.full.mp4`), rail_url: urlFor(`${m.id}.rail.mp4`), poster_url: urlFor(`${m.id}.webp`),
        lqip, width: full.w || pw.w, height: full.h || pw.h, duration: Math.round(full.d * 10) / 10,
      };
      if (LOCAL) writeFileSync(join(OUT, `${m.id}.json`), JSON.stringify(entry));
      processed++;
      const kb = (f) => Math.round(statSync(f).size / 1024);
      console.log(`   + ${m.id} ${m.timestamp.slice(0, 10)}  preview ${kb(prevMp4)} KB · full ${kb(fullMp4)} KB · rail ${kb(railMp4)} KB${UPLOAD ? ' · uploaded' : ''}`);
    } else {
      entry = { has_video: false };
    }
    items.push({
      ...entry,
      id: m.id, placeholder: false, permalink: m.permalink, timestamp: m.timestamp,
      caption: m.caption || '', lane: laneFor(m.caption, m.id, overrides.lanes || {}),
      visible: !hidden && !!entry.has_video, status: hidden ? 'hidden' : 'shown', flag_reason: hidden ? String(hiddenCfg[m.id]) : '',
      views: await viewsFor(m.id), likes: m.like_count ?? null,
    });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (UPLOAD) rmSync(OUT, { recursive: true, force: true });
}

// 5. English captions: translate new or edited Hebrew captions once (Gemini free tier), cached in data/translations.json.
const cache = readTranslations();
const tr = await translateMissing(items, cache, overrides);
if (tr.translated) writeTranslations(cache);
console.log(`Translations: ${tr.translated} new, ${tr.failed} failed, ${tr.pending} still missing${tr.noCredentials ? ' (no usable GEMINI_API_KEY)' : ''}.`);

const playable = items.filter((i) => i.visible);
const views = items.map((i) => i.views).filter((v) => typeof v === 'number');
const top = playable.reduce((a, b) => ((b.views ?? -1) > (a?.views ?? -1) ? b : a), null);
const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: false,
  source: UPLOAD ? 'instagram api → bunny cdn' : 'instagram api (local preview)',
  media_base_url: UPLOAD ? BUNNY.base : '',
  stats: {
    total_videos: videos.length,
    total_views: views.length ? views.reduce((a, b) => a + b, 0) : null,
    views_counted_over: views.length,
    views_sample: views.length === 0,
    top_visible_views: top?.views ?? null,
    top_visible_id: top?.id ?? null,
    shown: playable.length,
    hidden: items.filter((i) => i.status === 'hidden').length,
    missing_media_url: missing.length,
    missing_media_url_pct: videos.length ? Math.round((missing.length / videos.length) * 1000) / 10 : 0,
  },
  hero: null,
  items,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const s = manifest.stats;
const summary = [
  `Wrote ${MANIFEST}: ${items.length} Reels · ${s.shown} shown · ${s.hidden} hidden · ${processed} new/processed · ${reused} reused.`,
  `Views: ${s.total_views ?? 'n/a'} total across ${s.views_counted_over} Reels.`,
  `Licensed-audio check: ${missing.length} of ${videos.length} returned no media_url (${s.missing_media_url_pct}%).${s.missing_media_url_pct > 25 ? ' Over 25%: use the masters-folder fallback (PLAN.md 4.6).' : ''}`,
  `Translations: ${tr.translated} new, ${tr.pending} missing.`,
];
console.log('\n' + summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Instagram sync\n\n${summary.map((l) => `- ${l}`).join('\n')}\n`, { flag: 'a' });
