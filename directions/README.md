# Phase 2 — five design directions

Checkpoint: Bar picks one direction (or a direction plus named grafts from another). Phase 3 builds the real site from it.

## How to look at them

```bash
node scripts/serve.mjs
```

Then open http://localhost:4173/directions/ (launcher, all 10 variants) and http://localhost:4173/directions/shots/ (contact sheet of every screenshot). In the Claude desktop app the "directions" entry in `.claude/launch.json` starts the same server.

Rebuild after editing copy, config or a template:

```bash
node scripts/build-directions.mjs
```

Re-run screenshots and functional checks (real Google Chrome, 390×844 mobile and 1440×900 desktop, Hebrew and English):

```bash
node scripts/shots.mjs
```

## What is shared, what is per direction

- One copy source for all five: `i18n/he.json`, `i18n/en.json`. The comparison is about design, not words.
- One config: `i18n/site.json`. The WhatsApp number (`972536224344`) exists only there; every `wa.me` link is generated from it with the right-language prefilled message.
- One manifest: `data/instagram.json`, a placeholder fixture in the exact shape the phase 3 sync job writes (PLAN.md 4.6). All nine items are flagged `placeholder`, show a "דוגמה / Sample" badge, and the view counts carry a "נתוני דוגמה / Sample data" tag.
- One video controller: `assets/js/reels.js` (no src until half visible, top-most visible videos play, cap of 2 on mobile and 4 on desktop, hero starts after load, reduced-motion and Save-Data show posters only).
- Per direction: `directions/N/template.html` + `directions/N/style.css`, each with its own type pairing and layout.

Placeholder clips are abstract loops in the brand palette (`scripts/make-placeholders.sh`), so motion and pacing can be judged. Real Reels replace them when the sync job runs.

## The five

| # | Name | Idea | Type (Hebrew / Latin) | Grid | CTA |
|---|---|---|---|---|---|
| 1 | Matchday | Sports broadcast graphics: loop in a broadcast frame with live bug and timecode, lane ticker, scoreboard proof | Karantina, Bebas Neue numerals, Heebo | Multiview monitor wall, one big channel and eight small | Full-bleed cyan block |
| 2 | Premiere | Cinematic: letterboxed full-screen loop, serif headline, film-credits process | Frank Ruhl Libre, Assistant | Staggered film strip, swipe row on mobile | End card, outlined button |
| 3 | Feed | Native to Instagram: three phones playing Reels, profile header as proof, story highlights as lanes | Rubik | Explore-style grid with play counts | A WhatsApp chat window showing the real prefilled message |
| 4 | Manifest | Type-led brutalism: the loop shows only through the headline letters, numbered work index | Secular One, IBM Plex Sans Hebrew | Ruled index rows with thumbnails that grow on hover | Giant type link on cream |
| 5 | Studio | Light, quiet agency: cream ground, navy serif, cyan used once | Noto Serif Hebrew, Assistant | Editorial asymmetric 12-column grid with captions | Cyan button under a serif headline |

## Checks (all 20 page variants)

From `scripts/shots.mjs` (report in `directions/shots/report.json`, local only):

- No horizontal overflow at 390 px or 1440 px, in either language.
- `<html lang dir>` correct; hreflang pair present.
- Every WhatsApp link decodes to `wa.me/972536224344` with the right-language prefill.
- The WhatsApp float sits on the left in Hebrew and on the right in English.
- Grid videos play when in view, `currentTime` advances, never more than the cap play at once, and they pause when scrolled away. Hero loops play.
- No console errors, no failed requests.
- No Sporta or Sporta-client names in any direction file, copy file, data file or script.

Lighthouse mobile (simulated throttling, local server, unminified CSS, not yet optimized):

| Direction | Perf he / en | LCP he / en | CLS he | A11y | Best practices |
|---|---|---|---|---|---|
| 1 Matchday | 98 / 99 | 2.1 s / 1.9 s | 0.004 | 100 | 100 |
| 2 Premiere | 98 / 99 | 2.1 s / 1.8 s | 0.021 | 100 | 100 |
| 3 Feed | 97 / 98 | 2.3 s / 2.2 s | 0.001 | 100 | 100 |
| 4 Manifest | 98 / 99 | 2.1 s / 2.1 s | 0.003 | 100 | 100 |
| 5 Studio | 97 / 99 | 2.3 s / 2.0 s | 0.036 | 100 | 100 |

SEO shows 58 on every page only because direction pages are deliberately `noindex` and use relative hreflang URLs. The production pages in phase 3 get absolute hreflang and are indexable. Performance does not separate the directions; all five clear goal #4 already.

## Recommendation: 1 Matchday

Matchday is the strongest because it puts motion and the ask in the same first screen.

- On the Hebrew mobile fold (`1-he-mobile-fold.jpg`) the visitor sees a moving loop, the full headline, one sentence, a full-width WhatsApp button and "עונה באותו יום" without scrolling. The desktop fold (`1-he-desktop-fold.jpg`) keeps the same order.
- The multiview grid (`1-he-desktop-full.jpg`) shows nine Reels moving at once, which is the most work-forward grid of the five. A buyer of video sees video before reading anything.
- Karantina gives Hebrew a condensed display face with real presence, which most Hebrew sites lack. It ties back to Bar's sports-branding years without using any Sporta material.
- Proof reads as a scoreboard, so view counts feel like results rather than decoration.

What the others got wrong:

- **2 Premiere** looks the most expensive but makes the visitor work: the main button is an outlined pill at the bottom of a full-screen hero (`2-he-mobile-fold.jpg`), and the grid starts a full screen later. Serif cinema also undersells comedy reels.
- **3 Feed** converts well and its WhatsApp chat window is the best CTA of the five, but the phones, glass pills and rounded cards read like an app landing page (`3-en-desktop-fold.jpg`), below the 433/UEFA bar.
- **4 Manifest** is the most memorable, but the work is reduced to small thumbnails in an index (`4-he-desktop-full.jpg`), and the knockout headline depends on how bright each future Reel is.
- **5 Studio** is tasteful and calm, but on cream the Reels lose their punch, and nothing on the page feels scroll-stopping (`5-he-desktop-fold.jpg`), which is the promise in the headline.

Grafts worth taking into Matchday in phase 3, if Bar agrees: the WhatsApp chat-window CTA from 3, which shows the exact prefilled message before the click; and the profile-style proof row from 3 as the mobile version of the scoreboard. Things to tone down in Matchday: the timecode and "בשידור" bug could read as a costume for brand and comedy clients, so keep them only if Bar likes the broadcast wink.

## Copy claims to confirm

Everything here is sourced from Bar's Instagram bio or from PLAN.md decisions, except where marked.

- "7+ years in creative & branding": from the Instagram bio.
- "Same-day replies": Bar's decision.
- "Produced in Seedance and other tools": from the brief.
- View counts (1.2M total, per-reel numbers) and "9 videos published": sample data from the placeholder manifest, labelled as such on every page. The real numbers come from the API.
- Process steps (brief, concept and script, generation, edit and sound, delivery) and the three "why me" points: drafted by Claude from the brief and the old site. Bar should confirm the wording.
