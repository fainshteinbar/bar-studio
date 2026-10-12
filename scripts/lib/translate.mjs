// Hebrew → English caption translation for the sync, through the Claude API.
// Bar asked for a small, cheap model: default claude-haiku-5-5 at low effort (override with IG_TRANSLATE_MODEL).
// Each Reel is translated once and cached in data/translations.json by media ID + caption hash.
import Anthropic from '@anthropic-ai/sdk';
import { captionHash, isHebrew, pitchOf } from './captions.mjs';

const MODEL = process.env.IG_TRANSLATE_MODEL || 'claude-haiku-5-5';

const SYSTEM = `You translate Instagram Reel captions by an Israeli AI-video creator from Hebrew into English for his portfolio site.
The captions are short comedy and brand lines in spoken Israeli Hebrew, often with slang and a punchline.
Translate for meaning and humor, not word for word: an English reader should get the same joke with the same punch.
Keep it as short as the original or shorter. Keep names, brands, places, numbers and @handles as they are (transliterate Hebrew names).
Do not add hashtags, emoji, quotation marks that are not in the original, or explanations.
"pitch" is the first line (the hook). "more" is the follow-up; return an empty string if it is empty.`;

const SCHEMA = {
  type: 'object',
  properties: { pitch: { type: 'string' }, more: { type: 'string' } },
  required: ['pitch', 'more'],
  additionalProperties: false,
};

let client = null;
const getClient = () => (client ??= new Anthropic());

// Returns { pitch, more } in English, or null when translation is not possible (no credentials, refusal,
// API error, or the model returned Hebrew). Callers treat null as "show no pitch on the English page".
export async function translateCaption({ pitch, more }) {
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify({ pitch, more }) }],
    });
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return null;
    const out = JSON.parse(text);
    if (isHebrew(out.pitch) || isHebrew(out.more)) return null;
    return { pitch: String(out.pitch).trim().slice(0, 90), more: String(out.more || '').trim().slice(0, 160) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || /api[_ ]?key|apikey|authentication|credential/i.test(String(e?.message))) {
      const err = new Error('No Claude API credentials (set ANTHROPIC_API_KEY).');
      err.noCredentials = true;
      throw err;
    }
    if (e instanceof Anthropic.APIError) {
      console.log(`   translation failed: API ${e.status}`);
      return null;
    }
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

// Translate every visible Reel whose English is missing or stale. Mutates and returns the cache.
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
        cache.items[it.id] = { hash: captionHash(it.caption), ...t, source: `${MODEL}, ${new Date().toISOString().slice(0, 10)}` };
        result.translated++;
      } else {
        result.failed++;
      }
    } catch (e) {
      if (e.noCredentials) { result.noCredentials = true; break; }
      throw e;
    }
  }
  result.pending = todo.length - result.translated;
  return result;
}
