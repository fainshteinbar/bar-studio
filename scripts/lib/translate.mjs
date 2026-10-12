// Hebrew → English caption translation for the sync, through Google's Gemini API free tier
// (Bar chose a free provider; no billing on the key). Plain HTTPS, no SDK.
// Each Reel is translated once and cached in data/translations.json by media ID + caption hash.
//
// Env: GEMINI_API_KEY (required for translation), GEMINI_MODEL (optional; otherwise the newest available
// "gemini-X-flash" model, falling back to "flash-lite" when the first one is out of free quota).
import { captionHash, isHebrew, pitchOf } from './captions.mjs';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY = (process.env.GEMINI_API_KEY || '').trim();

const SYSTEM = `You translate Instagram Reel captions by an Israeli AI-video creator from Hebrew into English for his portfolio site.
The captions are short comedy and brand lines in spoken Israeli Hebrew, often with slang and a punchline.
Translate for meaning and humor, not word for word: an English reader should get the same joke with the same punch.
Keep it as short as the original or shorter. Keep names, brands, places, numbers and @handles as they are (transliterate Hebrew names).
Do not add hashtags, emoji, quotation marks that are not in the original, or explanations.
Input and output are JSON: "pitch" is the first line (the hook); "more" is the follow-up, an empty string if it is empty.`;

const noCreds = (why) => Object.assign(new Error(`Gemini translation unavailable: ${why}`), { noCredentials: true });

async function call(path, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

// Newest stable flash models first (e.g. gemini-3.5-flash, then gemini-3.5-flash-lite); preview/exp/tts/image variants skipped.
let models = null;
async function candidateModels() {
  if (models) return models;
  if (process.env.GEMINI_MODEL) return (models = [process.env.GEMINI_MODEL.replace(/^models\//, '')]);
  const { status, j } = await call('/models?pageSize=200');
  if (status === 400 || status === 401 || status === 403) throw noCreds(`key rejected (HTTP ${status})`);
  const ver = (n) => (n.match(/gemini-([\d.]+)/)?.[1] || '0').split('.').map(Number);
  const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };
  const usable = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
  const flash = usable.filter((n) => !n.endsWith('-lite')).sort(cmp);
  const lite = usable.filter((n) => n.endsWith('-lite')).sort(cmp);
  models = [...flash.slice(0, 1), ...lite.slice(0, 1)];
  if (!models.length) throw noCreds('no Gemini flash model available to this key');
  return models;
}

// Returns { pitch, more, model } in English, or null when this caption could not be translated (safety block,
// malformed output, or every model out of quota). Throws { noCredentials } when the key is missing or rejected.
export async function translateCaption({ pitch, more }) {
  if (!KEY) throw noCreds('GEMINI_API_KEY is not set');
  for (const model of await candidateModels()) {
    const { status, j } = await call(`/models/${model}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ pitch, more }) }] }],
        generationConfig: {
          temperature: 0.5,
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { pitch: { type: 'STRING' }, more: { type: 'STRING' } }, required: ['pitch', 'more'] },
        },
      }),
    });
    if (status === 429) { console.log(`   ${model}: free quota reached, trying the next model`); continue; }
    if (status === 400 && /API_KEY|api key/i.test(JSON.stringify(j))) throw noCreds('key rejected');
    if (status === 401 || status === 403) throw noCreds(`key rejected (HTTP ${status})`);
    if (status !== 200) { console.log(`   ${model}: HTTP ${status}`); continue; }
    const cand = j.candidates?.[0];
    const text = cand?.content?.parts?.map((p) => p.text || '').join('');
    if (!text || (cand.finishReason && cand.finishReason !== 'STOP')) return null;
    try {
      const out = JSON.parse(text);
      if (!out.pitch || isHebrew(out.pitch) || isHebrew(out.more)) return null;
      return { pitch: String(out.pitch).trim().slice(0, 90), more: String(out.more || '').trim().slice(0, 160), model };
    } catch {
      return null;
    }
  }
  return null;
}

// Translate every visible Reel whose English is missing or stale. Mutates the cache; untranslated Reels are
// simply retried on the next run (the English card shows no pitch meanwhile, never Hebrew).
export async function translateMissing(items, cache, overrides = {}) {
  const todo = items.filter((it) => {
    if (it.visible === false || overrides.captions_en?.[it.id]) return false;
    const src = pitchOf(it.caption);
    if (!isHebrew(src.pitch) && !isHebrew(src.more)) return false;
    const c = cache.items?.[it.id];
    return !c || c.hash !== captionHash(it.caption);
  });
  const result = { translated: 0, failed: 0, pending: todo.length, noCredentials: false };
  if (!todo.length) return result;
  cache.items ??= {};
  for (const it of todo) {
    try {
      const t = await translateCaption(pitchOf(it.caption));
      if (t) {
        cache.items[it.id] = { hash: captionHash(it.caption), pitch: t.pitch, more: t.more, source: `${t.model} (Gemini), ${new Date().toISOString().slice(0, 10)}` };
        result.translated++;
      } else {
        result.failed++;
      }
    } catch (e) {
      if (e.noCredentials) { console.log(`   ${e.message}`); result.noCredentials = true; break; }
      throw e;
    }
  }
  result.pending = todo.length - result.translated;
  return result;
}
