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

---

# Rebuild of direction 6: design rules (step 3, awaiting Bar's confirmation)

Premise from Bar (2026-10-12): direction 6's visual language (palette, bar.studio character, Narkiss Hadash Condensed) with genre.ai's structure and priorities. Work first, Bar second: the portrait-led first screen goes, and Bar appears as a credit. Dennis Snellenberg contributes only craft level. Evidence: `directions/references/notes.md`, screenshots in `directions/references/genre/` and `dennis/` (local only, gitignored).

## What the references actually do

- **genre.ai** makes the work enormous and lets it talk. Each project card is a half-screen video with a one-line, joke-shaped pitch ("Real people post their dreams online. They're boring. We made them more exciting."). It has one accent colour, quiet small type with one huge jump in scale, and a "start a project" button in a nav that never hides. Proof (a logo row) sits directly under the hero. Its first screen is a wordless brand sting, not client work, and it scores Lighthouse mobile 65 (LCP 24.5 s, 17 MB) and accessibility 89.
- **Dennis** has exact craft: magnetic buttons, fills that sweep up and exit through the top, word-by-word masked text reveals, hover images that follow the cursor with easing, and one motion curve for everything. His costs are a 4.5–6 s loader, no reduced-motion support, Lighthouse 83 and accessibility 75.
- **Not copied:** genre's ERA timeline, Plex Mono with a lime accent on cream, ↗ "START A PROJECT", the logo-morph sting, and the 16:9 card with a side text column. Dennis's language loader, curved curtain transitions, round blue buttons, name marquee and globe pill.

## Rules

Each rule has a test that `scripts/shots.mjs`, Lighthouse or a grep can check.

**Structure**
1. **Work from the first frame.** The hero is a full-bleed loop cut from Bar's real Reels, with one short headline on top. At 390×844, at least 2 real Reels are moving and the WhatsApp button is visible without scrolling. At 1440×900, at least 3 moving Reels, the CTA and one proof figure. No loader, no curtain.
2. **Bar is the credit, not the headline.** A credit line ("בר פאינשטיין · קריאייטיב דיירקטור · וידאו AI") sits under the headline, like a film credit. The portrait moves to a small About block lower down, or is dropped.
3. **Real proof right under the hero.** Numbers come from the API only: total views (418K), number of Reels (17), most-watched Reel (210K). No client names, logos or testimonials until real, permitted ones exist. Test: client-name grep returns 0, and the proof row starts within 1.2 screens on mobile.
4. **One loud CTA that never leaves.** WhatsApp sits in a sticky header pill on desktop and a pinned button on mobile (inline-end corner, ≥48 px), visible at every scroll depth. Same wording everywhere plus "עונה באותו יום / Same-day replies". At most 5 WhatsApp CTAs on the page and one email fallback. The number comes only from `i18n/site.json`.
5. **The work is big and speaks for itself.** Reels are shown large, at least half the viewport height on desktop, never as thumbnails. Each card has the Reel, its own caption's first line as the pitch, and one result (views). No paragraphs.
6. **Order tells a story.** The most-watched Reel is featured first and largest, then newest first. Lanes (comedy, ads, sports and brand) appear only once Bar tags Reels with hashtags or in `data/overrides.json`; today all 17 are untagged, so there's no lane filter yet.
7. **Click means watch with sound.** Tapping a Reel opens a 9:16 overlay that plays the full Reel with sound within 150 ms. It closes with Esc, back or a ✕ of at least 44 px, traps focus and returns focus to the card. The grid stays silent. This needs a second rendition per Reel (720 px, AAC audio) loaded only on click: an addition to PLAN.md 4.6.

**Brand**
8. **Type.** Display is Narkiss Hadash Condensed (Adobe kit) in both languages, at `clamp(48px, 13vw, 168px)` with line-height ≤ 0.95. Body text is Noto Sans Hebrew (self-hosted, normal width) in Hebrew and DM Sans in English. Small text uses at most 4 sizes between 12 and 20 px. Largest display to body ratio is ≥ 6 on desktop and ≥ 3 on mobile.
9. **Colour.** Void #07071C and navy #1A1464 grounds, cream #F4F0E8 text, and cyan #00C2FF as the only accent (CTA, active state, playing indicator). All text ≥ 4.5:1 contrast.
10. **bar.studio character kept from direction 6.** The two-tone headline (cream into cyan), tracked uppercase micro-labels in English only, pill buttons, and the blinking cyan "!" as the one signature detail.

**Craft (Dennis level, own forms)**
11. **One motion system.** Durations are 0.3, 0.5 or 0.7 s only. Two curves: `cubic-bezier(.7,0,.3,1)` for movement and `cubic-bezier(.23,1,.32,1)` for hover and press. A CSS lint finds no other durations.
12. **Hover and press.**
    - The WhatsApp CTA is magnetic on fine pointers only: strength ≤ 0.2 × its size, label moving at half strength, one spring overshoot on release.
    - Card hover swaps the poster to video, scales to 1.02 and slides the caption up.
    - Pressed elements scale to 0.97.
    - Link underlines draw from inline-start, mirrored in RTL.
13. **Reveals.** Headline words rise from a mask once (0.7 s, 30 ms stagger). The LCP element is the hero poster image, never the animated text, preloaded with high priority. No smooth-scroll library, no page transitions; the overlay opens and closes in ≤ 300 ms.

**Hard limits**
14. **Performance, accessibility and RTL.**
    - Lighthouse mobile performance ≥ 90, LCP < 2.5 s, accessibility 100, on the real Reels.
    - Transfer before scrolling ≤ 2.5 MB on mobile. Grid previews are the first 12 s of each Reel (≤ 2 MB each; today's full-length files run up to 8.4 MB), and the hero loop is ≤ 1.5 MB.
    - Reduced motion means no autoplay, no magnetic effect and no reveals.
    - Logical properties only, with every horizontal motion mirrored under `:dir(rtl)`.
    - No horizontal scroll at 390 px in either language.
