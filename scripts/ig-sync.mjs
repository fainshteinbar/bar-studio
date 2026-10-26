// Instagram sync (PLAN.md 4.6). Reads Bar's own Reels through the Instagram API with Instagram Login,
// downloads new ones in the same run (Instagram media URLs expire), makes three renditions + a poster,
// translates new captions, and writes the manifest the site is built from.
//
//   node scripts/ig-sync.mjs --upload [--force]   production (CI): media to the bar-studio-media repo (GitHub Pages), manifest data/instagram.json
//   node scripts/ig-sync.mjs --local              local preview: media/ig/ + data/instagram.local.json (both gitignored)
//   node scripts/ig-sync.mjs --check              token + account check only
//   node scripts/ig-sync.mjs --upload --detect     hourly gate: writes mode=full|stats|none to GITHUB_OUTPUT
//                                                 (media list + views for every Reel; no downloads)
//
// Upload mode is incremental against the committed manifest. Every run reads the media list and every Reel's
// views, then picks one of three modes:
//   full   a Reel was added or removed, a caption edited, the hidden list changed, or a Reel's media became
//          available (or --force): new Reels are downloaded, transcoded, uploaded and translated; Reels already
//          on the CDN are reused.
//   stats  no media work: a number a visitor sees changed (the compact formats in scripts/lib/display.mjs,
//          e.g. 211K -> 212K, or the proof-row total) and/or an English caption is still pending (retried here).
//          No downloads or uploads; if nothing ends up translated and no displayed number changed, the run
//          exits without writing anything.
//   none   nothing to do: exit before writing anything.
//
// Env: IG_ACCESS_TOKEN (else .secrets/ig-token locally), IG_API_VERSION (default v26.0),
//      upload mode: MEDIA_DEPLOY_KEY (secret, write deploy key of the media repo), MEDIA_REPO (owner/name), MEDIA_BASE_URL,
//      translation: GEMINI_API_KEY (Gemini free tier; without it new English captions stay empty, never Hebrew).
// Secrets are never printed; any URL that appears in an error is redacted.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, appendFileSync, createWriteStream, rmSync, copyFileSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { transcodeReel, transcodeFull, posterFrom, laneFor, tempDir, probe, brightness } from './lib/media.mjs';
import { readTranslations, writeTranslations, captionHash, isHebrew, pitchOf } from './lib/captions.mjs';
import { translateMissing } from './lib/translate.mjs';
import { displaySignature } from './lib/display.mjs';

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

const MEDIA = {
  deployKey: process.env.MEDIA_DEPLOY_KEY || '',
  repo: process.env.MEDIA_REPO || '',
  base: (process.env.MEDIA_BASE_URL || '').replace(/\/$/, ''),
};
if (UPLOAD && !DETECT && (!MEDIA.deployKey || !MEDIA.repo || !MEDIA.base)) {
  console.error('Upload mode needs MEDIA_DEPLOY_KEY, MEDIA_REPO and MEDIA_BASE_URL.');
  process.exit(2);
}
const SECRETS = [TOKEN, MEDIA.deployKey.trim(), process.env.GEMINI_API_KEY].filter(Boolean);
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

// Media host: a public repo served by GitHub Pages. Files are staged in a shallow clone and pushed once per run.
let mediaClone = null, mediaGit = null, mediaKeyDir = null;
function mediaSetup() {
  if (mediaClone) return;
  mediaClone = tempDir('igsync-media');
  mediaKeyDir = tempDir('igsync-key');
  const keyFile = join(mediaKeyDir, 'id');
  writeFileSync(keyFile, MEDIA.deployKey.trim() + '\n');
  chmodSync(keyFile, 0o600);
  const env = { ...process.env, GIT_SSH_COMMAND: `ssh -i ${keyFile} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new` };
  mediaGit = (...a) => { try { return execFileSync('git', a, { cwd: mediaClone, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { throw new Error(redact(`git ${a[0]} failed: ${e.stderr || e.message}`)); } };
  mediaGit('clone', '--quiet', '--depth', '1', `git@github.com:${MEDIA.repo}.git`, '.');
}
function mediaPut(localFile, remotePath) {
  mediaSetup();
  mkdirSync(join(mediaClone, remotePath, '..'), { recursive: true });
  copyFileSync(localFile, join(mediaClone, remotePath));
}
function mediaPublish(message) {
  if (!mediaClone) return;
  mediaGit('add', '-A');
  if (!mediaGit('status', '--porcelain').trim()) { console.log('Media repo: nothing to push.'); return; }
  mediaGit('-c', 'user.name=bfain-sync', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '--quiet', '-m', message);
  mediaGit('push', '--quiet', 'origin', 'HEAD:main');
  console.log('Media repo: pushed.');
}

const me = await api('/me', { fields: 'user_id,username,account_type,media_count' });
console.log(`Account: @${me.username} · type ${me.account_type || 'unknown'} · ${me.media_count ?? '?'} posts`);
if (has('--check')) {
  console.log('Token works. Media access OK:', !!(await api(`/${me.user_id || me.id}/media`, { fields: 'id', limit: '1' })).data);
  process.exit(0);
}
if (!UPLOAD && !LOCAL) { console.error('Choose --upload (CI) or --local (preview).'); process.exit(2); }

// 1. All media, newest first; Reels are the VIDEO items.
const fields = 'id,caption,media_type,media_product_type,is_shared_to_feed,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
// Trial Reels (shown only to non-followers) come back from /media like any Reel, with is_shared_to_feed false; they
// are not on the profile grid. Verified 2026-10-14 against the profile: every REELS item with false was missing from
// it (5 of 5), every one with true was there (17 of 17). There is no trial field in the API. A Trial Reel later
// shared to followers flips to true and is shown from then on.
const isTrial = (m) => m.media_product_type === 'REELS' && m.is_shared_to_feed === false;
let page = await api(`/${me.user_id || me.id}/media`, { fields, limit: '50' });
const all = [...page.data];
while (page.paging?.next) { page = await api(page.paging.next); all.push(...page.data); }
const videos = all.filter((m) => m.media_type === 'VIDEO');
const missing = videos.filter((m) => !m.media_url);
console.log(`Media: ${all.length} total, ${videos.length} videos, ${missing.length} without media_url.`);

const hiddenCfg = (existsSync('data/reels.json') ? JSON.parse(readFileSync('data/reels.json', 'utf8')) : {}).hidden || {};
// What the site does with each Reel: shown, hidden (data/reels.json, manual) or excluded-trial (automatic).
const statusOf = (m) => (hiddenCfg[m.id] ? 'hidden' : isTrial(m) ? 'excluded-trial' : 'shown');
const trials = videos.filter(isTrial);
if (trials.length) console.log(`Trial Reels (not on the profile grid, excluded): ${trials.map((m) => m.id).join(', ')}.`);
const overrides = existsSync('data/overrides.json') ? JSON.parse(readFileSync('data/overrides.json', 'utf8')) : {};
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { items: [] };
const prevById = Object.fromEntries((previous.items || []).filter((i) => !i.placeholder).map((i) => [i.id, i]));

// 2. Views (instagram_business_manage_insights) for every Reel, every run; skipped if not granted.
let insightsOk = true;
const viewsCache = new Map();
async function viewsFor(id) {
  if (!insightsOk) return null;
  if (viewsCache.has(id)) return viewsCache.get(id);
  try {
    const j = await api(`/${id}/insights`, { metric: 'views' });
    const v = j.data?.[0]?.values?.[0]?.value ?? j.data?.[0]?.total_value?.value ?? null;
    viewsCache.set(id, v);
    return v;
  } catch (e) {
    if (/code (10|200|100)\b/.test(e.message)) { insightsOk = false; console.log('Views: insights permission not granted, skipping.'); return null; }
    throw e;
  }
}

// 1b. Early exit (hourly schedule): stop here unless something a visitor would see has changed.
const reasons = [], pending = [], light = [];   // media work; English captions to translate; data-only changes
if (UPLOAD && !has('--force')) {
  const cache = readTranslations();
  const ids = new Set(videos.map((m) => m.id));
  for (const m of videos) {
    const prev = prevById[m.id], status = statusOf(m), shown = status === 'shown';
    if (!prev) { shown ? reasons.push(`new Reel ${m.id}`) : light.push(`new ${status} Reel ${m.id} (kept in the data, not shown)`); continue; }
    if ((prev.status || 'shown') !== status) (shown && !prev.has_video ? reasons : light).push(`${prev.status || 'shown'} -> ${status} ${m.id}`);
    if (!shown) continue;
    if ((m.caption || '') !== (prev.caption || '')) reasons.push(`caption edited ${m.id}`);
    if (!prev.has_video && m.media_url) reasons.push(`media now available ${m.id}`);
    if (prev.has_video && !overrides.captions_en?.[m.id]) {
      const src = pitchOf(m.caption);
      if ((isHebrew(src.pitch) || isHebrew(src.more)) && cache.items?.[m.id]?.hash !== captionHash(m.caption)) pending.push(`English caption pending ${m.id}`);
    }
  }
  for (const id of Object.keys(prevById)) if (!ids.has(id)) reasons.push(`Reel removed ${id}`);
}

// 1c. Stats: fresh views (and likes) for every Reel; does any number a visitor sees change?
let statsChanged = false;
if (UPLOAD && !has('--force') && !reasons.length) {
  const fresh = { ...previous, items: [] };
  for (const m of videos) {
    const prev = prevById[m.id] || {}, status = statusOf(m);
    fresh.items.push({ ...prev, status, visible: status === 'shown' && !!prev.has_video, views: await viewsFor(m.id), likes: m.like_count ?? null });
  }
  const views = fresh.items.filter((i) => i.visible).map((i) => i.views).filter((v) => typeof v === 'number');
  fresh.stats = { ...previous.stats, total_videos: fresh.items.filter((i) => i.visible).length, total_views: views.length ? views.reduce((a, b) => a + b, 0) : null };
  statsChanged = displaySignature(fresh) !== displaySignature(previous);
  console.log(`Stats: ${fresh.stats.total_views ?? 'n/a'} views (was ${previous.stats?.total_views ?? 'n/a'}); displayed numbers ${statsChanged ? 'changed' : 'unchanged'}.`);
}
const mode = !UPLOAD || has('--force') || reasons.length ? 'full' : statsChanged || pending.length || light.length ? 'stats' : 'none';
console.log(has('--force') ? 'Forced run.' : reasons.length ? `Work to do: ${reasons.join('; ')}.`
  : mode === 'stats' ? `No media work: ${[statsChanged && 'displayed view counts changed', ...pending, ...light].filter(Boolean).join('; ')}.`
  : 'Nothing a visitor would see changed: nothing to download, upload, translate or commit.');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\nchanged=${mode !== 'none'}\n`);
if (DETECT || mode === 'none') process.exit(0);

// 3. Visibility (data/reels.json, read above): media IDs Bar has hidden.

// 4. Renditions + poster for each visible Reel that is new (or --force); reuse everything else.
const OUT = LOCAL ? 'media/ig' : tempDir('igsync-out');
mkdirSync(OUT, { recursive: true });
const urlFor = (name) => (UPLOAD ? `${MEDIA.base}/reels/${name}` : `${OUT}/${name}`);
const tmp = tempDir('igsync');
const items = [];
let processed = 0, reused = 0;
try {
  for (const m of videos) {
    const status = statusOf(m), hidden = status !== 'shown';   // hidden by hand or an excluded Trial Reel
    const prev = prevById[m.id];
    const reusable = UPLOAD && !has('--force') && prev?.has_video && prev.video_url?.startsWith(MEDIA.base);
    const localReady = LOCAL && existsSync(join(OUT, `${m.id}.mp4`)) && existsSync(join(OUT, `${m.id}.full.mp4`)) && existsSync(join(OUT, `${m.id}.rail.mp4`)) && existsSync(join(OUT, `${m.id}.webp`));
    let entry;
    if (hidden) {
      // never downloaded or uploaded; media already on the CDN stays referenced, so un-hiding is instant
      entry = prev?.has_video ? { ...prev } : { has_video: false };
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
        for (const f of [prevMp4, fullMp4, railMp4, webp]) mediaPut(f, `reels/${f.split('/').pop()}`);
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
      console.log(`   + ${m.id} ${m.timestamp.slice(0, 10)}  preview ${kb(prevMp4)} KB · full ${kb(fullMp4)} KB · rail ${kb(railMp4)} KB${UPLOAD ? ' · staged' : ''}`);
    } else {
      entry = { has_video: false };
    }
    items.push({
      ...entry,
      id: m.id, placeholder: false, permalink: m.permalink, timestamp: m.timestamp,
      caption: m.caption || '', lane: laneFor(m.caption, m.id, overrides.lanes || {}),
      visible: !hidden && !!entry.has_video, status, excluded: status === 'excluded-trial' ? 'trial' : undefined,
      is_shared_to_feed: m.is_shared_to_feed ?? null, flag_reason: status === 'hidden' ? String(hiddenCfg[m.id]) : '',
      views: await viewsFor(m.id), likes: m.like_count ?? null,
    });
  }
  mediaPublish(`Sync Reels (${processed} new/processed) ${new Date().toISOString().slice(0, 16)} UTC`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (mediaClone) { rmSync(mediaClone, { recursive: true, force: true }); rmSync(mediaKeyDir, { recursive: true, force: true }); }
  if (UPLOAD) rmSync(OUT, { recursive: true, force: true });
}

// 5. English captions: translate new or edited Hebrew captions once (Gemini free tier), cached in data/translations.json.
const cache = readTranslations();
const tr = await translateMissing(items, cache, overrides);
if (tr.translated) writeTranslations(cache);
console.log(`Translations: ${tr.translated} new, ${tr.failed} failed, ${tr.pending} still missing${tr.noCredentials ? ' (no usable GEMINI_API_KEY)' : ''}.`);

// Every number on the site comes from visible Reels only; the raw data keeps the excluded ones.
const playable = items.filter((i) => i.visible);
const views = playable.map((i) => i.views).filter((v) => typeof v === 'number');
const top = playable.reduce((a, b) => ((b.views ?? -1) > (a?.views ?? -1) ? b : a), null);
// A stats-mode run (no media work) that translated nothing and changed no displayed number writes nothing,
// so a translation service that is down does not turn every hourly run into a commit.
const nextSig = (m) => displaySignature(m);
const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: false,
  source: UPLOAD ? 'instagram api → github pages media repo' : 'instagram api (local preview)',
  media_base_url: UPLOAD ? MEDIA.base : '',
  stats: {
    total_videos: playable.length,
    all_videos: videos.length,
    excluded_trial: items.filter((i) => i.status === 'excluded-trial').length,
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
if (UPLOAD && mode === 'stats' && !tr.translated && nextSig(manifest) === nextSig(previous)) {
  console.log('Nothing a visitor would see changed (no new translation, same displayed numbers): not writing the manifest.');
  process.exit(0);
}
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
