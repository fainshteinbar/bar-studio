# Brief: Rebuild index1.html — beat index.html, don't sidestep it

## The task
Redesign the portfolio homepage into `index1.html`. **Never modify `index.html`** — it is the live benchmark. The result must be *visibly better* than `index.html`, judged side by side in a browser.

## Read first, in this order
1. `Portfolio_Audience_Research.md` — the full audience research. Every section. The page must implement it.
2. `index.html` — **render it headless and look at it** (don't just read the code). It already implements most of the research. Understand why it works before writing anything.

## Hard-won feedback from the previous attempt (do not repeat these mistakes)
- A from-scratch "parallel aesthetic" failed. Thin Bebas strokes spread across full-width empty navy reads skeletal and template-y. index.html wins because the composition is **dense**: photo at half-frame, heavy type tightly wrapped beside it.
- Bar's photo (`Bar_Hero_Clean.png`, transparent bg, cyan rim light) must be prominent in the hero. Big. People hire people.
- Every case card needs a visual. No text-only cards.
- The three client testimonials (in `index.html` JS, `var testimonials = [...]`) are real — keep them. Never invent quotes.
- Use the real metrics from index.html's work cards (+2,305% follower growth La Liga, +1,138% likes/post, 12+ sub-brands IFA, 4,000+ athletes SOI, 2 Olympic cycles IPC, 10× output / 500+ assets/year AI). Not placeholder numbers.
- Continuous scroll effects matter to Bar: marquees, scroll-driven word reveals, things that pull you down the page.
- No 50/50 symmetric section layouts — the eye needs one entry point per viewport. Asymmetric hierarchy always.
- Less text. Numbers and type carry the message; paragraphs max 1–2 sentences.
- Verify visually: headless Chrome screenshots at desktop + mobile widths before declaring done. Trick for below-fold sections: make a temp copy with `min-height: 100vh` collapsed and reveal-classes forced visible (delete the temp copy after).

## Current state of index1.html
index.html + surgical upgrades: full-width cinematic flagship card (La Liga, metric-led headline), POV manifesto section, scroll progress bar, hero photo parallax, stat count-ups. Bar judged it not good enough — too close to a copy. Keep what works, but the redesign should be a real step up in art direction, not incremental patches.

## Brand system
- Palette: void `#07071C`, navy `#1A1464`, electric cyan `#00C2FF`, cream `#F4F0E8` (in index.html the cyan token is named `--pink`)
- Type: Bebas Neue (display) + DM Sans (body); local woff2 in `fonts/`
- Quality bar: UEFA campaign sites / 433 — premium sports design studio

## Assets
- `Bar_Hero_Clean.png` — portrait, transparent bg (1070×1200)
- `Images/IFA/1.jpg, 2.jpg, 3.jpg` — IFA match-campaign art; `Images/IFA/*.svg` — IFA sub-brand marks
- `ISR-1.svg`, `Jerusalem-1-1.svg` — local client logos
- Remote (sporta.digital): La Liga thumb `la-liga-best-start-1.jpg`, IFA thumb `Open.jpg`, logos `La_Liga.svg`, `Special.svg`, `Minhelet-1-2-1.svg`, `Beach-3.svg` (see index.html for full URLs)
- Case pages that must stay linked: `ifa.html`, `la-liga.html`, `special-olympics.html`, `paralympics.html`, `ai-production.html`, `about.html`, `Resume.pdf`

## Contact
fainshteinbar@gmail.com · LinkedIn: bar-fainshtein-67172a207 · Based in Hua Hin, Thailand (GMT+7) · Open to senior creative roles in sports, remote/relocatable
