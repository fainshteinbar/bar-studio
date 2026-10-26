// Production build for bfain.studio.
//   src/index.html + i18n/{he,en}.json + i18n/site.json + data/instagram.json
//   -> index.html (he, rtl, the site root) and en/index.html (en, ltr), sitemap.xml, robots.txt
// Zero dependencies (template engine below).
//
// Manifest: data/instagram.json (committed; written by the CI sync with media-repo URLs). MANIFEST=local uses
// data/instagram.local.json (gitignored, media/ig paths) for offline work.
// The two first-screen rail posters (the LCP image and its neighbour) are copied into assets/first/ and served
// from the site's own origin, so LCP never waits on a second connection to the media CDN.
//
// Template syntax
//   {{path}}            escaped value      {{{path}}}  raw HTML
//   {{#each path [n]}}…{{/each}}  loop (not nested); inside: {{it.x}}, {{n}} (01-based), {{i}}
//   {{#if path}}…{{/if}}  {{#unless path}}…{{/unless}}  (nestable)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pitchOf, englishPitch, readTranslations } from './lib/captions.mjs';
import { compactFor } from './lib/display.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const site = read('i18n/site.json');
const MANIFEST = process.env.MANIFEST === 'local' && existsSync('data/instagram.local.json') ? 'data/instagram.local.json' : 'data/instagram.json';
const manifest = read(MANIFEST);
const fixture = read('data/instagram.json');
// Logo for inlining: the delivered dark-background SVG, colours untouched; only the C2PA provenance block
// (kept in the file itself) is dropped from the inline copy, and the <svg> is made decorative inside its link.
// Defined once as a <symbol> (logo_defs) and referenced by header and footer (logo), so the paths ship once.
const LOGO_SRC = readFileSync('assets/img/bfain-logo-dark-bg.svg', 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const LOGO_VIEWBOX = LOGO_SRC.match(/viewBox="([^"]+)"/)[1];
const LOGO_PATHS = LOGO_SRC.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
const LOGO_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><symbol id="bfain-logo" viewBox="${LOGO_VIEWBOX}">${LOGO_PATHS}</symbol></svg>`;
const LOGO = `<svg class="logo-svg" viewBox="${LOGO_VIEWBOX}" aria-hidden="true" focusable="false"><use href="#bfain-logo"/></svg>`;
const translations = readTranslations();
const overridesAll = existsSync('data/overrides.json') ? read('data/overrides.json') : {};
console.log(`manifest: ${MANIFEST}`);
const langs = { he: read('i18n/he.json'), en: read('i18n/en.json') };

// Featured = most-watched visible Reel; rail = data/overrides.json rail IDs, else the newest four others.
function pickRail(items, ov) {
  const featured = items.reduce((a, b) => ((b.views ?? -1) > (a?.views ?? -1) ? b : a), null);
  const others = items.filter((x) => x !== featured);
  const picked = (ov.rail || []).map((id) => others.find((x) => x.id === id)).filter(Boolean);
  const rail = picked.length >= 2 ? picked.concat(others.filter((x) => !picked.includes(x))).slice(0, 4) : others.slice(0, 4);
  return { featured, others, rail };
}

// Same-origin copies of the first-screen posters (downloaded from the CDN when missing; stale ones removed),
// re-encoded at 432 px (they display about 190 CSS px wide on phones) when dwebp/cwebp are available.
const shrinkPoster = (bytes, out) => {
  const tmp = join(tmpdir(), `first-${process.pid}`);
  writeFileSync(`${tmp}.webp`, bytes);
  const ok = spawnSync('dwebp', ['-quiet', `${tmp}.webp`, '-o', `${tmp}.png`]).status === 0 &&
    spawnSync('cwebp', ['-quiet', '-q', '70', '-m', '6', '-resize', '432', '0', `${tmp}.png`, '-o', out]).status === 0;
  if (!ok) writeFileSync(out, bytes);
  rmSync(`${tmp}.webp`, { force: true }); rmSync(`${tmp}.png`, { force: true });
};
const FIRST = 'assets/first';
const firstLocal = {};
{
  const want = pickRail(manifest.items.filter((it) => it.visible !== false), overridesAll).rail.slice(0, 2).filter((it) => it.poster_url);
  mkdirSync(FIRST, { recursive: true });
  const keep = new Set(want.map((it) => `${it.id}.webp`));
  for (const f of readdirSync(FIRST)) if (!keep.has(f)) rmSync(join(FIRST, f));
  for (const it of want) {
    const file = join(FIRST, `${it.id}.webp`);
    if (!existsSync(file)) {
      if (/^https?:/.test(it.poster_url)) {
        const r = await fetch(it.poster_url);
        if (!r.ok) { console.log(`   first-screen poster ${it.id}: HTTP ${r.status}, staying on the CDN`); continue; }
        shrinkPoster(Buffer.from(await r.arrayBuffer()), file);
      } else if (existsSync(it.poster_url)) {
        shrinkPoster(readFileSync(it.poster_url), file);
      } else continue;
    }
    firstLocal[it.id] = `${FIRST}/${it.id}.webp`;
  }
}

// Stylesheets are inlined: the page is one document, and an extra HTML -> CSS -> font hop before first paint
// cost about as much as the CSS itself in PageSpeed's mobile simulation. url("../x") is rebased per page.
const minCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
const CSS = { base: minCss(readFileSync('assets/css/base.css', 'utf8')), site: minCss(readFileSync('assets/css/site.css', 'utf8')), guide: minCss(readFileSync('assets/css/guide.css', 'utf8')) };
const inlineCss = (css, root) => `<style>${css.replace(/url\("\.\.\//g, `url("${root}assets/`)}</style>`;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const get = (ctx, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);

function render(tpl, ctx) {
  tpl = tpl.replace(/\{\{#each ([\w.]+)(?: (\d+))?\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, path, lim, inner) => {
    let arr = get(ctx, path) || [];
    if (lim) arr = arr.slice(0, +lim);
    return arr.map((it, i) => render(inner, { ...ctx, it, i, n: String(i + 1).padStart(2, '0') })).join('');
  });
  // Innermost first (the body may not contain another opening if/unless), repeated until stable, so blocks nest.
  const block = /\{\{#(if|unless) ([\w.]+)\}\}((?:(?!\{\{#(?:if|unless) )[\s\S])*?)\{\{\/\1\}\}/g;
  for (let prev = null; prev !== tpl; ) {
    prev = tpl;
    tpl = tpl.replace(block, (_, kind, path, inner) => (truthy(get(ctx, path)) === (kind === 'if') ? inner : ''));
  }
  tpl = tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, p) => String(get(ctx, p) ?? ''));
  tpl = tpl.replace(/\{\{([\w.@]+)\}\}/g, (m, p) => {
    const v = get(ctx, p);
    if (v === undefined) throw new Error(`Unknown template key: ${p}`);
    return esc(v);
  });
  return tpl;
}

// /guide/: copy from i18n/<lang>.json "guide", example Reels from data/overrides.json "guide". Every number is read
// from the manifest at build time, so the hourly sync keeps the guide current. A Reel that is no longer on the site
// drops out of the guide with a warning instead of failing the build (the sync must keep publishing).
const wordsHtml = (str) => str.split(' ').map((w, i) => `<span class="w"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ');
function guideContext(t, lang, items, compact) {
  const g = t.guide;
  const cfg = overridesAll.guide || {};
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  const pick = (id, where) => byId[id] || (console.warn(`   guide: Reel ${id} (${where}) is not on the site; skipped`), null);
  const fill = (str, vars) => str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const views = items.map((x) => x.views).filter((v) => v != null).sort((a, b) => a - b);
  const median = views.length % 2 ? views[(views.length - 1) / 2] : (views[views.length / 2 - 1] + views[views.length / 2]) / 2;
  const ice = pick(cfg.icecream, 'icecream');
  const hasNumbers = !!(ice?.views && median);
  const nums = hasNumbers ? { icecream: compact.format(ice.views), ratio: String(Math.round(ice.views / median)) } : {};
  const rate = (x) => (x?.views ? (x.likes ?? 0) / x.views : 0);
  const topRate = Math.max(...items.map(rate));
  const pct = new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', { style: 'percent', maximumFractionDigits: 1 });
  const rules = g.rules.items.map((r, i) => ({ ...r, reel: pick(cfg.rules?.[i], `rules[${i}]`) })).filter((r) => r.reel);
  const sectors = g.sectors.items.map((sct) => {
    const reel = pick(cfg.sectors?.[sct.key], `sectors.${sct.key}`);
    if (!reel) return null;
    const likes = { likes_pct: pct.format(rate(reel)), likes_top: rate(reel) === topRate ? sct.likes_top || '' : '' };
    const shown = (cfg.hide_views || []).includes(sct.key) ? { ...reel, views_fmt: '', views_html: '' } : reel;
    return { ...sct, reel: shown, gets: fill(sct.gets, likes) };
  }).filter(Boolean);
  return {
    t: g,
    title_a: wordsHtml(g.hero.title_a),
    title_b: wordsHtml(g.hero.title_b),
    lead: hasNumbers ? fill(g.hero.lead, nums) : g.hero.lead.split('. ')[0] + '.',
    has_numbers: hasNumbers,
    icecream_fmt: nums.icecream || '',
    ratio: nums.ratio || '',
    rules,
    sectors,
  };
}

const WA_ICON =
  '<svg class="wa-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg>';

// page: 'home' (/, /en/) or 'guide' (/guide/, /en/guide/). root is the path back to the site root.
function context(lang, root, base, page = 'home') {
  const t = langs[lang];
  const guidePage = page === 'guide';
  const pagePath = guidePage ? `${t.guide.slug}/` : '';
  const other = lang === 'he' ? 'en' : 'he';
  const loc = lang === 'he' ? 'he-IL' : 'en-US';
  const compact = { format: compactFor(loc) };   // the same formatter the sync uses to decide whether to commit
  const url = (p) => (/^https?:/.test(p) ? p : root + p);
  const he_home = lang === 'he' ? (guidePage ? '../' : './') : (guidePage ? '../../' : '../');
  const en_home = lang === 'he' ? (guidePage ? '../en/' : 'en/') : (guidePage ? '../' : './');
  const he_url = he_home;
  const en_url = en_home;
  const guide_url = guidePage ? './' : `${t.guide.slug}/`;
  const alt_page = guidePage ? (lang === 'he' ? `../en/${t.guide.slug}/` : `../../${t.guide.slug}/`) : (lang === 'he' ? 'en/' : '../');
  const wa_url = `https://wa.me/${site.whatsapp_number}?text=${encodeURIComponent(guidePage ? t.guide.wa_prefill : t.wa_prefill)}`;
  const mail_url = `mailto:${site.email}?subject=${encodeURIComponent(t.cta.email_subject)}`;
  const ig_url = `https://www.instagram.com/${site.instagram}/`;

  const dateFmt = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const mediaHtml = (it, { eager = false, priority = false, railVideo = false } = {}) =>
    `<span class="reel-media" style="aspect-ratio:${it.width}/${it.height}">` +
    (eager
      ? `<img class="reel-poster" src="${esc(url(firstLocal[it.id] || it.poster_url))}" width="${it.width}" height="${it.height}" alt="" decoding="async" fetchpriority="${priority ? 'high' : 'low'}" style="background-image:url(${it.lqip})">`
      : `<img class="reel-poster" src="${it.lqip || 'data:,'}" data-poster="${esc(url(it.poster_url))}" width="${it.width}" height="${it.height}" alt="" decoding="async">`) +
    (it.has_video
      ? (railVideo && it.rail_url
        ? `<video class="reel-video" muted loop playsinline preload="none" data-src-portrait="${esc(url(it.rail_url))}" data-src-landscape="${esc(url(it.video_url))}" aria-hidden="true" tabindex="-1"></video>`
        : `<video class="reel-video" muted loop playsinline preload="none" data-src="${esc(url(it.video_url))}" aria-hidden="true" tabindex="-1"></video>`)
      : '') +
    `</span>`;

  const items = manifest.items.filter((it) => it.visible !== false).map((it, i) => {
    const n = String(i + 1).padStart(2, '0');
    // English pages never show Hebrew: manual override > cached translation > English original > no pitch.
    const src = it.placeholder ? { pitch: `${t.grid.sample_title} ${n}`, more: '' } : lang === 'en' ? englishPitch(it, translations, overridesAll) : pitchOf(it.caption);
    const fallbackLabel = `${t.lane_names[it.lane] || t.lane_names.reels} ${n}`;
    const title = src.pitch || fallbackLabel; // accessible name: always present, always in the page language
    const pitchHe = /[\u0590-\u05FF]/.test(src.pitch);
    const media =
      `<span class="reel-media" style="aspect-ratio:${it.width}/${it.height}">` +
      `<img class="reel-poster" src="${it.lqip || 'data:,'}" data-poster="${esc(url(it.poster_url))}" width="${it.width}" height="${it.height}" alt="" decoding="async">` +
      (it.has_video
        ? `<video class="reel-video" muted loop playsinline preload="none" data-src="${esc(url(it.video_url))}" aria-hidden="true" tabindex="-1"></video>`
        : '') +
      `</span>`;
    return {
      ...it,
      n,
      title,
      media,
      lane_name: t.lane_names[it.lane] || it.lane,
      views_fmt: it.views == null ? '' : compact.format(it.views),
      views_html: it.views == null ? '' : `<span class="ltr">${compact.format(it.views)}</span> ${esc(t.grid.views)}`,
      href: it.permalink,
      pitch: src.pitch,
      pitch_more: src.more,
      pitch_lang: pitchHe ? 'he' : 'en',
      pitch_dir: pitchHe ? 'rtl' : 'ltr',
      full: esc(url(it.full_url || it.video_url || '')),
      poster: esc(url(it.poster_url)),
      date_fmt: it.timestamp ? dateFmt.format(new Date(it.timestamp)) : '',
      media_rail: mediaHtml(it, { eager: i < 2, priority: false }),
    };
  });
  // The two first-screen rail posters (either can be the LCP image) load at high priority.
  const { featured, others, rail: railSrc } = pickRail(items, overridesAll);
  const rail = railSrc.map((x, i) => ({ ...x, media_rail: mediaHtml(x, { eager: i < 2, priority: i < 2, railVideo: true }) }));
  const featuredCtx = featured && { ...featured, media_big: mediaHtml(featured, {}) };
  const words = (str) => str.split(' ').map((w, i) => `<span class="w"><span style="--i:${i}">${esc(w)}</span></span>`).join(' ');

  const h = manifest.hero || { landscape: { poster_url: '', video_url: '', width: 16, height: 9 }, portrait: { poster_url: '', video_url: '', width: 9, height: 16 } };
  const heroImg = (v, prio) =>
    `<img class="reel-poster" src="${esc(url(v.poster_url))}" width="${v.width}" height="${v.height}" alt="" decoding="async"${prio ? ' fetchpriority="high"' : ' loading="lazy"'}>`;
  const heroVideo = (attrs) => `<video class="reel-video" muted loop playsinline preload="none" data-hero ${attrs} aria-hidden="true" tabindex="-1"></video>`;
  const hero = {
    landscape:
      `<span class="reel-media hero-media" role="img" aria-label="${esc(t.a11y.hero_video)}">${heroImg(h.landscape, true)}` +
      heroVideo(`data-src="${esc(url(h.landscape.video_url))}"`) + `</span>`,
    portrait:
      `<span class="reel-media hero-media" role="img" aria-label="${esc(t.a11y.hero_video)}">${heroImg(h.portrait, true)}` +
      heroVideo(`data-src="${esc(url(h.portrait.video_url))}"`) + `</span>`,
    responsive:
      `<span class="reel-media hero-media" role="img" aria-label="${esc(t.a11y.hero_video)}"><picture>` +
      `<source media="(max-aspect-ratio: 1/1)" srcset="${esc(url(h.portrait.poster_url))}" width="${h.portrait.width}" height="${h.portrait.height}">` +
      `${heroImg(h.landscape, true)}</picture>` +
      heroVideo(`data-src-portrait="${esc(url(h.portrait.video_url))}" data-src-landscape="${esc(url(h.landscape.video_url))}"`) +
      `</span>`,
  };

  const SITE = site.site_url;
  const pageUrl = `${SITE}${lang === 'he' ? '' : 'en/'}${pagePath}`;
  const ogImage = `${SITE}assets/img/og-${guidePage ? 'guide-' : ''}${lang}.jpg`;
  const meta = guidePage ? t.guide.meta : t.meta;
  const mediaOrigin = (() => { try { return new URL(manifest.media_base_url || '').origin; } catch { return ''; } })();
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfessionalService', '@id': `${SITE}#studio`, name: site.brand, url: SITE,
        logo: `${SITE}favicon-512.png`, image: ogImage, description: t.meta.description,
        email: site.email, telephone: `+${site.whatsapp_number}`, areaServed: ['IL', 'Worldwide'],
        founder: { '@type': 'Person', '@id': `${SITE}#bar`, name: site.person, jobTitle: lang === 'he' ? 'קריאייטיב דיירקטור, וידאו AI' : 'Creative director, AI video', sameAs: [`https://www.instagram.com/${site.instagram}/`] },
        sameAs: [`https://www.instagram.com/${site.instagram}/`],
      },
      { '@type': 'WebSite', '@id': `${SITE}#site`, url: SITE, name: site.brand, inLanguage: ['he', 'en'], publisher: { '@id': `${SITE}#studio` } },
      { '@type': 'WebPage', url: pageUrl, name: meta.title, inLanguage: lang, isPartOf: { '@id': `${SITE}#site` }, about: { '@id': `${SITE}#studio` } },
    ],
  };
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}">`,
    `<link rel="canonical" href="${pageUrl}">`,
    `<link rel="alternate" hreflang="he" href="${SITE}${pagePath}">`,
    `<link rel="alternate" hreflang="en" href="${SITE}en/${pagePath}">`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pagePath}">`,
    mediaOrigin ? `<link rel="preconnect" href="${mediaOrigin}">` : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.brand)}">`,
    `<meta property="og:url" content="${pageUrl}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:image" content="${ogImage}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(meta.og_alt)}">`,
    `<meta property="og:locale" content="${t.meta.og_locale}">`,
    `<meta property="og:locale:alternate" content="${langs[other].meta.og_locale}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${ogImage}">`,
    '<meta name="theme-color" content="#07071C">',
    `<link rel="icon" href="${root}favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${root}favicon-32x32.png">`,
    `<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">`,
    inlineCss(CSS.base, root),
    `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');

  const sample = manifest.placeholder || manifest.stats.views_sample ? `<span class="sample-tag">${esc(t.proof.sample_tag)}</span>` : '';
  return {
    t,
    site,
    lang,
    dir: t.dir,
    he: lang === 'he',
    en: lang === 'en',
    subset: lang === 'he' ? 'hebrew' : 'latin',
    root,
    base,
    he_url,
    en_url,
    alt_url: lang === 'he' ? en_url : he_url,
    alt_lang: other,
    head,
    wa_url,
    mail_url,
    ig_url,
    wa_icon: WA_ICON,
    items,
    hero,
    placeholder: !!manifest.placeholder,
    sample,
    rail,
    featured: featuredCtx,
    others,
    hero_words_a: words(t.hero.title_a),
    hero_words_b: words(t.hero.title_b),
    updated_fmt: manifest.generated_at ? dateFmt.format(new Date(manifest.generated_at)) : '',
    stats: {
      top_views_fmt: featured?.views != null ? compact.format(featured.views) : '',
      top_views: featured?.views ?? 0,
      total_views: manifest.stats.total_views ?? fixture.stats.total_views,
      total_videos: manifest.stats.total_videos,
      total_views_fmt: compact.format(manifest.stats.total_views ?? fixture.stats.total_views),
    },
    site_css: inlineCss(CSS.site, root),
    skip: `<a class="skip-link" href="#main">${esc(t.a11y.skip)}</a>`,
    logo: LOGO,
    logo_defs: LOGO_DEFS,
    home_url: lang === 'he' ? he_home : en_home,
    guide_url,
    guide_css: guidePage ? inlineCss(CSS.guide, root) : '',
    g: guidePage ? guideContext(t, lang, items, compact) : null,
    lang_toggle: `<a class="lang-toggle" href="${alt_page}" hreflang="${other}" lang="${other}">${esc(t.nav.lang_switch)}<span class="sr-only"> · ${esc(t.a11y.lang_switch_label)}</span></a>`,
    wa_float: `<a class="wa-float" href="${esc(wa_url)}" target="_blank" rel="noopener" aria-label="${esc(t.a11y.wa_float)}">${WA_ICON}<span class="wa-float-label">${esc(t.promise)}</span></a>`,
    email_ltr: `<bdi dir="ltr">${esc(site.email)}</bdi>`,
    scripts: `<script src="${root}assets/js/reels.js" defer></script>`,
    // Adobe Fonts kit (Narkiss Hadash Condensed). Text paints in the width-matched fallback, then swaps
    // (font-display: swap is set in the kit's project settings). The fallback is built from the site's own
    // fonts, not local() ones, so it wraps the same on every OS (PageSpeed runs on Linux, which has no Arial):
    // bold Narkiss is 0.70x Noto Sans Hebrew and 0.62x DM Sans in width (measured). Until those two fallback
    // files are in (about 0.1 s, at most 1.2 s), html.fl keeps the hero copy hidden: painted in a system font
    // first, the bottom-aligned headline wrapped differently and the whole block jumped (desktop CLS 0.3).
    typekit: [
      '<link rel="preconnect" href="https://use.typekit.net" crossorigin>',
      '<link rel="preconnect" href="https://use.typekit.net">',
      '<link rel="preconnect" href="https://p.typekit.net">',
      // Requested after the load event and the first paint: PageSpeed's simulation charges any request that
      // starts before first paint (the kit CSS, p.typekit.net, two font files on two more origins) to FCP and
      // LCP, and on slow CPUs the font swap relayout would compete with the first frame.
      '<script>(function(){function k(){var l=document.createElement("link");l.rel="stylesheet";l.href="https://use.typekit.net/gce3kmw.css";document.head.appendChild(l)}' +
        'function w(){if(performance.getEntriesByType("paint").length)return k();try{new PerformanceObserver(function(l,o){o.disconnect();k()}).observe({type:"paint",buffered:true})}catch(e){setTimeout(k,500)}}' +
        'if(document.readyState==="complete")w();else addEventListener("load",w,{once:true})})()</script>',
      '<noscript><link rel="stylesheet" href="https://use.typekit.net/gce3kmw.css"></noscript>',
      `<style>@font-face{font-family:"Narkiss Fallback";font-weight:100 900;src:url("${root}assets/fonts/noto-sans-hebrew-var-hebrew.woff2") format("woff2");unicode-range:U+0590-05FF,U+FB1D-FB4F;size-adjust:70.5%;ascent-override:122%;descent-override:49%;line-gap-override:0%}` +
        `@font-face{font-family:"Narkiss Fallback";font-weight:100 900;src:url("${root}assets/fonts/dm-sans-latin-600.woff2") format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122,U+2212;size-adjust:62%;ascent-override:139%;descent-override:56%;line-gap-override:0%}</style>`,
      '<script>(function(){var d=document.documentElement,f=document.fonts,x=function(){d.classList.remove("fl")};d.classList.add("fl");setTimeout(x,1200);' +
        'if(f&&f.load)Promise.all([f.load(\'800 1em "Narkiss Fallback"\',"AI"),f.load(\'800 1em "Narkiss Fallback"\',"\u05d0")]).then(x,x);else x()})()</script>',
    ].join('\n'),
  };
}

const tpl = readFileSync('src/index.html', 'utf8');
writeFileSync('index.html', render(tpl, context('he', '', '')));
mkdirSync('en', { recursive: true });
writeFileSync(join('en', 'index.html'), render(tpl, context('en', '../', '../')));

const guideTpl = readFileSync('src/guide.html', 'utf8');
for (const lang of ['he', 'en']) {
  const dir = lang === 'he' ? langs.he.guide.slug : join('en', langs.en.guide.slug);
  const root = lang === 'he' ? '../' : '../../';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), render(guideTpl, context(lang, root, root, 'guide')));
}

const SITE = site.site_url;
const today = new Date().toISOString().slice(0, 10);
const alt = `<xhtml:link rel="alternate" hreflang="he" href="${SITE}"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`;
const altGuide = `<xhtml:link rel="alternate" hreflang="he" href="${SITE}${langs.he.guide.slug}/"/><xhtml:link rel="alternate" hreflang="en" href="${SITE}en/${langs.en.guide.slug}/"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${langs.he.guide.slug}/"/>`;
writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${SITE}</loc><lastmod>${today}</lastmod>${alt}</url>
  <url><loc>${SITE}en/</loc><lastmod>${today}</lastmod>${alt}</url>
  <url><loc>${SITE}${langs.he.guide.slug}/</loc><lastmod>${today}</lastmod>${altGuide}</url>
  <url><loc>${SITE}en/${langs.en.guide.slug}/</loc><lastmod>${today}</lastmod>${altGuide}</url>
</urlset>
`);
writeFileSync('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
console.log(`built index.html (he) + en/index.html, guide/ + en/guide/, sitemap.xml, robots.txt from ${MANIFEST}`);
