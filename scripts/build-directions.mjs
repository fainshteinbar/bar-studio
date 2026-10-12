// Renders the phase-2 design directions.
//   directions/N/template.html + i18n/{he,en}.json + i18n/site.json + data/instagram.json
//   -> directions/N/index.html (he, rtl) and directions/N/en/index.html (en, ltr)
// Zero dependencies. Prototype of the production build (PLAN.md 6.1).
//
// Template syntax
//   {{path}}            escaped value      {{{path}}}  raw HTML
//   {{#each path [n]}}…{{/each}}  loop (not nested); inside: {{it.x}}, {{n}} (01-based), {{i}}
//   {{#if path}}…{{/if}}  {{#unless path}}…{{/unless}}  (not nested in themselves)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const site = read('i18n/site.json');
// A local import (scripts/import-reels.mjs, gitignored) takes precedence over the committed fixture.
const MANIFEST = existsSync('data/instagram.local.json') ? 'data/instagram.local.json' : 'data/instagram.json';
const manifest = read(MANIFEST);
const fixture = read('data/instagram.json');
console.log(`manifest: ${MANIFEST}`);
const langs = { he: read('i18n/he.json'), en: read('i18n/en.json') };

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
  tpl = tpl.replace(/\{\{#(if|unless) ([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, kind, path, inner) =>
    truthy(get(ctx, path)) === (kind === 'if') ? render(inner, ctx) : ''
  );
  tpl = tpl.replace(/\{\{\{([\w.]+)\}\}\}/g, (_, p) => String(get(ctx, p) ?? ''));
  tpl = tpl.replace(/\{\{([\w.@]+)\}\}/g, (m, p) => {
    const v = get(ctx, p);
    if (v === undefined) throw new Error(`Unknown template key: ${p}`);
    return esc(v);
  });
  return tpl;
}

const WA_ICON =
  '<svg class="wa-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg>';

function context(lang, root, base) {
  const t = langs[lang];
  const other = lang === 'he' ? 'en' : 'he';
  const loc = lang === 'he' ? 'he-IL' : 'en-US';
  const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
  const url = (p) => (/^https?:/.test(p) ? p : root + p);
  const he_url = lang === 'he' ? './' : '../';
  const en_url = lang === 'he' ? 'en/' : './';
  const wa_url = `https://wa.me/${site.whatsapp_number}?text=${encodeURIComponent(t.wa_prefill)}`;
  const mail_url = `mailto:${site.email}?subject=${encodeURIComponent(t.cta.email_subject)}`;
  const ig_url = `https://www.instagram.com/${site.instagram}/`;

  const items = manifest.items.map((it, i) => {
    const n = String(i + 1).padStart(2, '0');
    const title = it.placeholder ? `${t.grid.sample_title} ${n}` : (it.caption || '').split('\n')[0].slice(0, 70) || `${t.lane_names[it.lane] || it.lane} ${n}`;
    const media =
      `<span class="reel-media" style="aspect-ratio:${it.width}/${it.height}">` +
      `<img class="reel-poster" src="${esc(url(it.poster_url))}" width="${it.width}" height="${it.height}" alt="" loading="lazy" decoding="async" style="background-image:url(${it.lqip})">` +
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
    };
  });

  const h = manifest.hero;
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

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${esc(t.meta.title)}</title>`,
    `<meta name="description" content="${esc(t.meta.description)}">`,
    '<meta name="robots" content="noindex">',
    `<link rel="alternate" hreflang="he" href="${he_url}">`,
    `<link rel="alternate" hreflang="en" href="${en_url}">`,
    `<link rel="alternate" hreflang="x-default" href="${he_url}">`,
    `<meta property="og:title" content="${esc(t.meta.title)}">`,
    `<meta property="og:description" content="${esc(t.meta.description)}">`,
    `<meta property="og:locale" content="${t.meta.og_locale}">`,
    `<meta property="og:locale:alternate" content="${langs[other].meta.og_locale}">`,
    '<meta name="theme-color" content="#07071C">',
    `<link rel="icon" href="${root}favicon.ico" sizes="any">`,
    `<link rel="stylesheet" href="${root}assets/css/base.css">`,
  ].join('\n');

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
    stats: {
      total_videos: manifest.stats.total_videos,
      total_views_fmt: compact.format(manifest.stats.total_views ?? fixture.stats.total_views),
    },
    skip: `<a class="skip-link" href="#main">${esc(t.a11y.skip)}</a>`,
    lang_toggle: `<a class="lang-toggle" href="${lang === 'he' ? en_url : he_url}" hreflang="${other}">${esc(t.nav.lang_switch)}<span class="sr-only" lang="${other}"> · ${esc(t.a11y.lang_switch_label)}</span></a>`,
    wa_float: `<a class="wa-float" href="${esc(wa_url)}" target="_blank" rel="noopener" aria-label="${esc(t.a11y.wa_float)}">${WA_ICON}<span class="wa-float-label">${esc(t.promise)}</span></a>`,
    email_ltr: `<bdi dir="ltr">${esc(site.email)}</bdi>`,
    scripts: `<script src="${root}assets/js/reels.js" defer></script>`,
  };
}

const dirs = readdirSync('directions', { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d+$/.test(d.name) && existsSync(join('directions', d.name, 'template.html')))
  .map((d) => d.name)
  .sort();

for (const d of dirs) {
  const tpl = readFileSync(join('directions', d, 'template.html'), 'utf8');
  writeFileSync(join('directions', d, 'index.html'), render(tpl, context('he', '../../', '')));
  mkdirSync(join('directions', d, 'en'), { recursive: true });
  writeFileSync(join('directions', d, 'en', 'index.html'), render(tpl, context('en', '../../../', '../')));
  console.log(`directions/${d}: he + en`);
}

// Launcher page
const names = {};
for (const d of dirs) {
  const m = readFileSync(join('directions', d, 'template.html'), 'utf8').match(/<!--\s*direction:\s*(.+?)\s*-->/);
  names[d] = m ? m[1] : `Direction ${d}`;
}
writeFileSync(
  'directions/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Design directions</title>
<style>:root{color-scheme:dark}body{margin:0;background:#07071C;color:#F4F0E8;font:16px/1.5 system-ui,sans-serif;padding:clamp(16px,5vw,64px)}h1{font-weight:600;margin:0 0 24px}ol{list-style:none;padding:0;display:grid;gap:12px;max-width:720px}li{display:flex;gap:16px;align-items:baseline;justify-content:space-between;border-top:1px solid #1A1464;padding-top:12px}a{color:#00C2FF}span{opacity:.7}</style></head><body>
<h1>bar.studio: five directions</h1><ol>${dirs
    .map((d) => `<li><span>${d}</span><strong>${esc(names[d])}</strong><a href="${d}/">עברית</a><a href="${d}/en/">English</a></li>`)
    .join('')}</ol><p><a href="shots/">Screenshot contact sheet</a></p></body></html>\n`
);
console.log('directions/index.html');
