// Caption handling shared by the sync (translation) and the build (cards), so both cut captions identically.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// Caption lines without bidi isolates, tabs, hashtags or emoji. Line 1 is the card's pitch, lines 2–3 the "more".
export function captionLines(caption) {
  return (caption || '')
    .replace(/[⁦-⁩‎‏\t]/g, '')
    .replace(/#[\p{L}_][^\s#]*/gu, '') // hashtags (keeps "#1:" style numbering)
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍/gu, '')
    .split('\n')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export const pitchOf = (caption) => {
  const lines = captionLines(caption);
  return { pitch: (lines[0] || '').slice(0, 90), more: lines.slice(1, 3).join(' ').slice(0, 160) };
};

export const isHebrew = (s) => /[֐-׿]/.test(s || '');

// Hash of the raw caption: an edited caption on Instagram gets a fresh translation.
export const captionHash = (caption) => createHash('sha256').update(caption || '').digest('hex').slice(0, 16);

export const TRANSLATIONS = 'data/translations.json';
export const readTranslations = () =>
  existsSync(TRANSLATIONS) ? JSON.parse(readFileSync(TRANSLATIONS, 'utf8')) : { items: {} };
export const writeTranslations = (t) => writeFileSync(TRANSLATIONS, JSON.stringify(t, null, 2) + '\n');

// English pitch for a Reel: manual override > cached translation (if the caption is unchanged) > the caption itself
// when it is already English > nothing. Never returns Hebrew.
export function englishPitch(item, translations, overrides = {}) {
  const manual = overrides.captions_en?.[item.id];
  if (manual) return typeof manual === 'string' ? { pitch: manual, more: '' } : { pitch: manual.pitch || '', more: manual.more || '' };
  const src = pitchOf(item.caption);
  if (!isHebrew(src.pitch) && !isHebrew(src.more)) return src;
  const t = translations.items?.[item.id];
  if (t && t.hash === captionHash(item.caption)) return { pitch: t.pitch || '', more: t.more || '' };
  return { pitch: '', more: '' };
}
