# Phase 2 — six design directions

Checkpoint: Bar picks one direction (or a direction plus named grafts from another). Phase 3 builds the real site from it.

## How to look at them

```bash
node scripts/serve.mjs
```

Then open http://localhost:4173/directions/ (launcher, all 12 variants) and http://localhost:4173/directions/shots/ (contact sheet of every screenshot). In the Claude desktop app the "directions" entry in `.claude/launch.json` starts the same server.

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

Placeholder clips are abstract loops in the brand palette (`scripts/make-placeholders.sh`), so motion and pacing can be judged.

## Swapping in real Reels

```bash
node scripts/import-reels.mjs "/path/to/your/reels"
node scripts/build-directions.mjs
node scripts/shots.mjs
```

The importer takes the newest 9 files (mp4, mov, m4v, webm), transcodes them exactly as PLAN.md 4.6 defines (720 px wide, never upscaled, H.264 CRF 28, no audio, faststart, WebP poster, LQIP) and builds both hero loops with the 4.7 recipe. Output goes to `media/local/` and `data/instagram.local.json`, both gitignored, so real video never enters the repo. The build prefers the local manifest when it exists. `node scripts/import-reels.mjs --clear` goes back to placeholders.

Optional: put a `reels.json` in the folder to set a title, lane or Instagram link per file, for example `{ "kit.mp4": { "title": "Kit launch", "lane": "sport" } }`. Local files have no view counts, so cards show no per-video views and the proof row keeps its labelled sample figure until the Instagram API supplies real numbers. Tested end to end on a stand-in folder, including a Hebrew filename containing an apostrophe; all six directions played the imported clips.

## The five

| # | Name | Idea | Type (Hebrew / Latin) | Grid | CTA |
|---|---|---|---|---|---|
| 1 | Matchday | Sports broadcast graphics: loop in a broadcast frame with live bug and timecode, lane ticker, scoreboard proof | Karantina, Bebas Neue numerals, Heebo | Multiview monitor wall, one big channel and eight small | Full-bleed cyan block |
| 2 | Premiere | Cinematic: letterboxed full-screen loop, serif headline, film-credits process | Frank Ruhl Libre, Assistant | Staggered film strip, swipe row on mobile | End card, outlined button |
| 3 | Feed | Native to Instagram: three phones playing Reels, profile header as proof, story highlights as lanes | Rubik | Explore-style grid with play counts | A WhatsApp chat window showing the real prefilled message |
| 4 | Manifest | Type-led brutalism: the loop shows only through the headline letters, numbered work index | Secular One, IBM Plex Sans Hebrew | Ruled index rows with thumbnails that grow on hover | Giant type link on cream |
| 5 | Studio | Light, quiet agency: cream ground, navy serif, cyan used once | Noto Serif Hebrew, Assistant | Editorial asymmetric 12-column grid with captions | Cyan button under a serif headline |
| 6 | Current site, evolved | The live bar.studio language rebuilt for video, Hebrew and WhatsApp: portrait with cyan glow, two-tone condensed caps headline, tracked micro-labels, pills, ruled stats, cyan CTA card, cursor | Condensed heavy Noto Sans Hebrew (width axis), Bebas Neue, DM Sans | Rounded surface cards, one flagship 2×2 | Cyan rounded card with a dark pill |

## Direction 6: what the live site's appeal is made of

Audited from `index.html` (2,081 lines of CSS) and rendered at 1440 and 390 px.

- **The first screen is design, not Sporta.** Its character comes from Bebas Neue caps at 9vw with the last lines in cyan, Bar's rim-lit portrait on a navy radial glow, tracked uppercase DM Sans labels at 0.12–0.22em, cyan pill buttons, a giant ghost letter, a blinking "!", and a custom cursor. None of that depends on client work, and it transfers.
- **The middle of the page leans on Sporta.** The case-study grid gets its richness from La Liga and federation artwork, and the "trusted by" marquee and testimonials are client content. Remove them and the live page goes flat between the stats row and the contact panel. In direction 6 that stretch is carried by the Reels instead, so its quality now depends on them.
- **Hebrew needed a substitute.** Bebas Neue has no Hebrew. Noto Sans Hebrew at weight 900 and its narrowest width is the closest match: a straight condensed grotesque, unlike Karantina's stencil feel. One 17 KB variable file covers every Hebrew weight. English keeps real Bebas and DM Sans. Wide letter-spacing is dropped on Hebrew labels, because it only works on Latin capitals.

Kept: tokens, type roles, pills, chips, ghost letter, blinking "!", ruled stats, surface cards, outline marquee, cyan CTA card, cursor. Changed: case studies become Reel cards; a floating Reel card sits on the portrait so video is visible in the first screen; WhatsApp replaces the email-only CTA.

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
| 6 Current site, evolved | 97 / 97 | 2.48 s / 2.5 s | 0 | 100 | 100 |

SEO shows 58 on every page only because direction pages are deliberately `noindex` and use relative hreflang URLs. The production pages in phase 3 get absolute hreflang and are indexable. Directions 1 to 5 clear goal #4 with room to spare because their largest element is text. Direction 6's largest element is the portrait photo, so it passes by only about 20 ms (2,477 ms against 2,500 ms). Phase 3 would widen that margin with inlined critical CSS and a tighter mobile crop of the portrait.

## Recommendation (six directions): 6, current site evolved

Direction 6 is the strongest, with 1 Matchday a close second.

- **People hire people.** Bar sells himself, not a studio roster. Direction 6 is the only one where his face and the headline share the first screen (`6-he-desktop-fold.jpg`), as on the live site. Directions 1 to 5 reduce him to an About section.
- **It survives any content.** The portrait carries the first screen whatever the latest Reel looks like. Matchday's first screen is only as good as the current Reel in its frame.
- **Brand continuity.** It is recognisably the bar.studio that LinkedIn, the resume and past contacts already know, now in Hebrew and video-first. The condensed Hebrew headline (`6-he-mobile-fold.jpg`) keeps the poster weight that makes the live site work.
- **The ask is in the first screen.** Desktop and mobile both show the WhatsApp pill and "עונה באותו יום" before scrolling.

Where 6 is weaker:

- Less video in the first screen than Matchday: one floating Reel card rather than a full broadcast frame.
- The thinnest LCP margin of the six, as noted above.

Matchday (`1-he-mobile-fold.jpg`) remains the most work-forward: loop, headline, button and promise on one phone screen, and nine Reels moving at once in its grid. If the real Reels turn out to be the strongest asset, Matchday may overtake 6. That's the reason to run the importer before the final call.

What the others got wrong, unchanged from the five-way review: 2 Premiere hides the button and the work behind a full-screen hero; 3 Feed reads like an app landing page; 4 Manifest shrinks the videos to thumbnails; 5 Studio loses the Reels' punch on cream.

Grafts worth considering for the winner: Feed's WhatsApp chat-window CTA, which shows the exact prefilled message before the click; and, if 6 is chosen, Matchday's multiview energy for the work grid on desktop.

## Copy claims to confirm

Everything here is sourced from Bar's Instagram bio or from PLAN.md decisions, except where marked.

- "7+ years in creative & branding": from the Instagram bio.
- "Same-day replies": Bar's decision.
- "Produced in Seedance and other tools": from the brief.
- View counts (1.2M total, per-reel numbers) and "9 videos published": sample data from the placeholder manifest, labelled as such on every page. The real numbers come from the API.
- Process steps (brief, concept and script, generation, edit and sound, delivery) and the three "why me" points: drafted by Claude from the brief and the old site. Bar should confirm the wording.
