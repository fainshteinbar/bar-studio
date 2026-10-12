# Reference notes: genre.ai (structure) and dennissnellenberg.com (craft)

Captured 2026-10-12 with Playwright + real Chrome (headless), desktop 1440×900 and mobile 390×844 (isMobile, hasTouch, DPR 2). Neither site showed a cookie banner. No forms were submitted and nothing was logged into. All timings are from an unthrottled connection unless marked "Lighthouse" (Lighthouse 'mobile' preset, simulated throttling). Scripts live in the session scratchpad, not in the repo.

---

## Part A: genre.ai

### A1. Stack
- Built with Framer: 374 `data-framer-*` nodes, `framerusercontent.com` assets, Framer's `animator` and appear-effects JSON. No GSAP, Lenis, Locomotive, Barba, Swiper or HLS.js globals. Scrolling is native: `scroll-behavior: auto`, no scroll smoothing.
- Fonts (document.fonts, loaded): IBM Plex Sans 200/300/400, IBM Plex Mono 400/500/700, Space Mono 700, Inter 400. The wordmark is an image or SVG, not a font.

### A2. Section order (desktop, page height 8,612 px)
Evidence: `genre/desktop_01…11_*.jpg`, `desktop_fullpage.jpg`. The full-page capture loses the work cards because their scroll-in fade resets to opacity 0 when the page is scrolled back to the top. The scroll-step shots show them.

| # | Section | Contents |
|---|---|---|
| 1 | Hero (`Hero`, 100vh on desktop, 412 px = 49% of the screen on mobile) | A single full-bleed video with no text, no nav and no CTA on top of it. A scroll-cue chevron links to `#clients`. The video is a **5.05 s brand sting**: the word "genre" redrawn in about 10 different genre styles (graffiti, blackletter, neon, chrome, grid), ending on the clean wordmark. `loop=false`, so it stops on the logo. See `genre/hero-video_frames_every-0.5s.jpg`, `desktop_01_first-screen_3s.jpg`, `recon at 5 s = logo on black`. |
| 2 | Nav (sticky) + logo wall | The nav sits **below** the hero and becomes sticky (`position: sticky; top: 0`, 111 px tall on desktop, 87 px on mobile) once the hero has scrolled past. Logo marquee: Amazon, DraftKings, Hennessy, IM8, Kalshi, Popeyes, Nike + "AND MORE +", drifting about 86 px/s (sampled: 72 px in 840 ms). `desktop_02_scroll-y900.jpg` |
| 3 | Intro | H1 "At the Forefront of Every Era of AI" (Plex Sans 200, 90 px), a 3-line subhead, then an "OUR WORK" label. |
| 4 | Work: an "eras" timeline | A left gutter carries a vertical timeline with dots and era labels (ERA_03 Cinematic production / ERA_02 Cultural velocity / ERA_01 The beginning). There are 8 project cards: a 16:9 video at 725×437 plus a 381 px text column holding the client (caps mono), the year, the title (Plex Sans 300, 24 px) and a one-line logline in mono. One card has a 01/02/03 gallery switcher and one has "SEE THE CASE STUDY". `desktop_03…07` |
| 5 | Studio | A dark band with a halftone-lime image and the text "A NEXT GEN CREATIVE STUDIO" (Plex Mono 700, 124 px, uppercase). Below it, "ABOUT US / Ideas Without Limits", two paragraphs, a "WORK WITH US" link and a bento of 5 images/GIFs, one of them an "OUR ETHOS" card (BE FIRST. PUSH FORWARD. BREAK THE FRAME. TELL BETTER STORIES.). `desktop_08` |
| 6 | Capabilities | Two columns (Branded content / Narrative), 6 items each, with lime "+" glyphs. `desktop_09` |
| 7 | CTA banner | A full-bleed black band with a halftone-lime landscape and "START A PROJECT ↗" in about 124 px mono caps. **Not a link**: there is no anchor and the cursor is `auto` at its center. |
| 8 | Contact | "GET IN TOUCH / Let's Build What's Next" with a 7-field form (name, email, company, project type▾, timeline▾, budget▾, message) and a full-width black SUBMIT button. `desktop_10` |
| 9 | Footer | Wordmark, a blurb, "2026 GENRE ALL RIGHTS RESERVED", columns NAVIGATION / CONNECT (X, Instagram, YouTube) / LEGAL. `desktop_11` |

Mobile order is the same but the dark "NEXT GEN" band and the big CTA banner are gone. Each card is stacked (16:9 video at 358×200, then the text block, then "WATCH THE AD ↗"). `mobile_01…10`.

### A3. First screen, work above the fold, proof, CTAs
- **First screen is video:** 100% of the desktop viewport (1440×900). On mobile the hero is 412/844 = 49%, and the nav, the logo wall and the top of the H1 show below it (`mobile_01_first-screen_3s.jpg`).
- **Works visible before scrolling: 0 at both widths.** The hero is a brand sting, not a showreel of client work. The first project preview's top edge sits at y ≈ 1,763 on desktop (about 2 screens down) and y ≈ 915 on mobile (about 1.1 screens down).
- **Proof:** a logo wall right after the hero (7 logos + "AND MORE"), then the client name and year on every card (NECTAR 2026, KALSHI 2025…). There are **no** numbers, view counts, counters, press or testimonials anywhere on the page. (PLAN.md section 2 says AI studios like genre.ai use "animated counters" and a "press row". That is not true of genre.ai today. Its proof is logos plus named clients.)
- **CTAs:**
  - The desktop nav "↗ START A PROJECT" is visible on every scroll step after the hero (sticky). It is the only persistent CTA.
  - "↗ WORK WITH US" in the About section (y ≈ 6,897).
  - The decorative "START A PROJECT" banner (not clickable).
  - The contact form, with SUBMIT.
  - The footer CONTACT link.
  - Linked conversion CTAs on the page: 3 (nav, Work with us, footer) plus the form.
  - Per-work CTAs: a play glyph on every desktop card, and "WATCH THE AD ↗" ×10 on mobile.
  - On **mobile the CTA hides inside the hamburger** (menu: WORK / STUDIO / CONTACT, plus "START A PROJECT" at the bottom). No CTA is visible on the mobile first screen.
- **Nav behaviour:** sticky, **never hides** on scroll down or up (`desktop_zz_after-scroll-up.jpg`, and nav `top=0` on all steps). The active section is shown with a lime "·" dot and lime text (WORK → STUDIO → CONTACT as you scroll, `desktop_08`, `desktop_10`). The mobile menu is a full-screen cream sheet that is fully in by 400 ms (`mobile_menu_150/400/1000ms.jpg`).

### A4. Video handling
| Video | Format | Size | Resolution | Attributes |
|---|---|---|---|---|
| Hero | H.264 MP4, 23.976 fps, 17 Mbps | **10.8 MB** (HEAD 10,776,604 B) | **3840×2160** | autoplay, muted, playsinline, `preload=auto`, `loop=false`. Poster is a **3840×2160 PNG, about 1.96 MB**. Same file on mobile, rendered at 390×1150 with object-fit cover. |
| 9 card previews | WebM | 136 KB to 1.8 MB each (139 K, 744 K, 1.04 M, 225 K, 1.84 M, 328 K, 1.64 M, 677 K, plus one more) | 800×450 | muted, loop, playsinline, no poster. Framer flips `preload` from none/metadata to auto and starts playback as they approach. |

- All files are served from `framerusercontent.com` (first party to Framer). Full films are on **Vimeo**.
- **Concurrency:** on desktop, 1–3 previews were playing in view at each step. `playingTotal` was 9 at the top of the page, so previews below the fold were already playing; the count fell as you scrolled. On mobile, playing equalled in-view (1–3).
- **Hover** on a card: cursor pointer, and the translucent grey play triangle turns solid lime (`hover_work-card-1_before/after.jpg`). There is no scale, no sound and no scrub.
- **Click** opens a modal:
  - The URL gains `?ismodalopen=yes&currentvideourl=https://vimeo.com/…`.
  - A `rgba(0,0,0,.85)` overlay is in by 150 ms with a lime ×.
  - The Vimeo iframe (`player.vimeo.com/video/…`) appears at about 1,032×580 and still shows a loading ring at 1,200 ms. The oEmbed call had `autoplay=false`.
  - Escape did **not** close it.
  - Evidence: `click_work-modal_150ms/400ms/1200ms/after-escape.jpg`. On mobile the same modal opens with a 16:9 player (`mobile_tap-watch-the-ad_1500ms.jpg`).

### A5. Motion and interaction
- Framer appear effects, read from the inline JSON:
  - Intro: opacity 0.001→1, 1.5 s, delay 0.5 s, ease `cubic-bezier(.8,.2,0,1)`.
  - Staggered items: y 8→0 + fade, 0.8 s, delay 2.6 s, ease `(.44,0,.56,1)`.
- Cards fade in on scroll: opacity 0 → 0.31 → 0.94 → 1 while the card top moves from 680 to 560 px in a 900 px viewport. That is about a 120 px fade band at roughly 70% of the viewport height, with no translate.
- Nav link hover: color transition `1.5s cubic-bezier(0.8,0.2,0,1)` that **dims** the link (#373737 toward grey). Slow, almost lazy (`hover_nav-link-work_*.jpg`).
- "START A PROJECT" hover: the label swaps to italic/oblique and the lime arrow stays (`hover_nav-cta-start-project_*.jpg`). It is a Framer variant swap, so there is no CSS transition to read.
- No custom cursor, no loader, no page transitions (single page with anchor links), no parallax, no pinned sections apart from the sticky nav, no text-split reveals.

### A6. Typography, layout, color
| Role | Desktop | Mobile |
|---|---|---|
| Display band (Plex Mono 700, caps) | 124/124 | (section hidden) |
| H1 (Plex Sans 200) | 90/90, −1.8 px (−0.02em) | 32/35.2 |
| H2 (Plex Sans 300) | 79/86.9, −1.58 px | 31/34.1 |
| Subhead / card title (Plex Sans 300) | 24/28.8, −0.24 px | 20/24 |
| Era label (Plex Mono 500) | 18/21.6 | n/a |
| Body (Plex Sans 400) | 16/25.6 (1.6) | 16/25.6 |
| Logline (Plex Mono 400) | 14/22.4 | 14/22.4 |
| Nav (Plex Mono 500 caps) | 15/18 | n/a |
| CTA label (Plex Mono 700) | 13/15.6 | 12/14.4 |
| Micro labels (Plex Mono, caps) | 12/14.4, −0.36 px | 12 |

- The scale is not modular. Small steps run 12–13–14–15–16–18 (about 1.07×), then the sizes jump 24 → 79/90 → 124 (about 3.3–3.75×). Contrast comes from the jump between display and everything else.
- Grid: desktop side margins 60–65 px. The work row is a 275 px timeline gutter, a 725 px video and a 381 px text column. Mobile gutters are 16 px (cards 358 px wide).
- Palette (computed):
  - Background #F5F1EE (warm cream).
  - Text #373737.
  - Ink #1A1919.
  - Accent lime rgb(204,210,19) = #CCD213, used on the active nav, arrows, "+", the play-icon hover and era tags.
  - Black bands with halftone-lime imagery.
  - The only "dark" moments are the hero and two image bands. The site is light overall.

### A7. Performance
- Lighthouse mobile: **Performance 65**, LCP **24.5 s**, FCP 1.3 s, TBT 320 ms, CLS 0, page weight **17,254 KiB**, **Accessibility 89** (fails: heading-order, html-has-lang, landmark-one-main, link-name).
- Real Chrome, no scroll, 5 s after load:
  - Desktop: 50 requests / 24.7 MB.
  - Mobile: 41 / 17.3 MB.
  - The biggest files are the hero MP4 (10.5 MB), the 4K PNG poster (1.96 MB), a 2.9 MB GIF and the WebM previews.
- PerformanceObserver LCP (unthrottled): desktop 672 ms (the video poster); mobile 252 ms on the H4, then 596 ms on the video poster. CLS 0.
- A full scroll-through transfers about 26–29 MB.

---

## Part B: dennissnellenberg.com (craft only)

### B1. Stack
- jQuery 3.5.1, GSAP 3.9.1 + ScrollTrigger, Barba 2.10.3 (page transitions), Locomotive Scroll (smooth scroll, `html.has-scroll-smooth`), vanilla-lazyload, js-cookie.
- One custom font, "Dennis Sans" 450. Hero name at 216 px, body 17.28 px.
- Source read from `/assets/js/index-new.js` and `/assets/css/style-new.css`, so the values below are exact, not estimated.

### B2. Loader (home only)
Evidence: `dennis/desktop_loader_*-after-words-appear.jpg`, and `desktop_00_loader_*` are blank pre-loader frames.
- A dark screen (#141517) with a dot + "Hello". Words cycle in 9 languages: 0.01 s cuts, 0.15 s stagger, about 165 ms per word measured, about 1.6 s for the cycle.
- Then the whole screen lifts: `top 0 → −100%`, 0.8 s, Power4.easeInOut. It carries a **curved bottom edge**: an ellipse "rounded-div" whose height animates 10vh → 0 over 1 s, Power4.easeInOut.
- The page content (`.once-in`) rises `y 50vh → 0`, 1.5 s, Expo.easeOut, stagger 0.07 (mobile: 10vh).
- `html { cursor: wait }` until the reveal, and scrolling is locked (`scroll.stop()`).
- Measured: the words appear 2.46 s after navigation (DCL 1.98 s), the curtain starts lifting at +1.98 s, the content settles at about +3.5 s. So **content is hidden for about 4.5–6 s** on first visit.
- With `prefers-reduced-motion: reduce` emulated, the loader still runs. The CSS has no reduced-motion rules.

### B3. Page transition, home → /work
Evidence: `dennis/transition_home-to-work_150…2000ms.jpg`, `transition_work-page_settled.jpg`.
- Barba, `sync: true`.
- **Cover phase:** the dark sheet rises from the bottom, `top 100% → 0`, 0.5 s, Power4.easeIn. It has a curved **top** edge that grows 0 → 10vh in 0.4 s.
- **Hold phase:** the destination's name fades in at center ("· Work", opacity 0→1 and y −50, 0.8 s, Power4.easeOut).
- **Reveal phase:** the sheet exits upward, `top 0 → −100%`, 0.8 s, Power3.easeInOut, with the curved bottom edge collapsing 10vh → 0 over 0.85 s.
- **Content phase:** the new page's `.once-in` blocks rise 50vh → 0, 1 s, Expo.easeOut, stagger 0.05, delay 0.8.
- Measured frames: 150 ms sheet top at 891 px; 300 ms at 753 px with a 45 px curve; 450 ms at 17 px; 600–1,200 ms covered while "Work" fades in to opacity 0.99; 1,500 ms sheet at −379 px; 2,000 ms gone.
- **Total about 2.0 s.** The URL changes immediately (pushState).

### B4. Magnetic buttons (desktop > 540 px only)
- Formula: `x = (cursorX/width − 0.5) × strength`, the same for y. GSAP 1.5 s, Power4.easeOut. The inner `.btn-text` moves with half the strength, which gives a parallax layer.
- Leave: back to 0 with **Elastic.easeOut, 1.5 s**.
- Strengths (`data-strength` / `data-strength-text`): big round CTAs ("About me", "Get in touch") 100/50; contact pills 25/15; "More work" 25/15; nav links 24/12 (side menu) or 20/10 (header); socials 20/10.
- Measured on "About me" (173 px circle), cursor 60 px right and 60 px down from center (0.347 of the size):

  | Time | Button | Text |
  |---|---|---|
  | 100 ms | 9.6 px | 4.8 px |
  | 250 ms | 20.1 px | 10 px |
  | 500 ms | 29.3 px | 14.7 px |
  | 1,000 ms | 33.8 px | 16.9 px |
  | Settled | **34 px** | **17 px** |

  Leave: −1 (100 ms), −4.5 (300 ms), +2.6 (500 ms), 0.1 (800 ms), 0 by 1.5 s. That is a visible elastic overshoot of about 13% of travel.
- Measured on header "Work" (82×48 px, strength 20/10), cursor offset 29,17: settles at 7 / 6.9 px, with the text at 3.5 / 3.4.
- Fill on hover: `.btn-fill` is a 150%-wide ellipse that slides `y 76% → 0`, 0.6 s, Power2.easeInOut. Text color changes in 0.3 s. On leave the fill exits upward (`y → −76%`), so it enters from below and leaves through the top.
- Evidence: `hover_magnetic_About-me_offset.jpg`, `hover_magnetic_Work_offset.jpg`.

### B5. Work-list hover with a floating image (desktop)
Evidence: `hover_worklist_before/item1/item2.jpg`.
- On mouseenter a floating panel opens. CSS `width 0 → clamp(10em, 27.5vw, 25em)`, measured 0 → 396 px. Opening is 0.4 s `cubic-bezier(0.34,1,0.64,1)` (ease-out-back-like). Closing is 0.4 s `cubic-bezier(0.36,0,0.66,0)` (ease-in).
  - Measured widths: 47 px at 50 ms, 256 px at 150 ms, 360 px at 250 ms, 396 px at 400 ms.
- A blue circular "View" button rides on top. It grows 0 → clamp(3.75em, 5.5vw, 5em), measured 79 px.
- **Follow lag:** a GSAP ticker at 120 Hz runs `pos += (mouse − pos)/12` for the image, `/7` for the button and `/6` for the label. Measured after a 400 px cursor jump, image left: 16 ms +36, 50 ms +96, 100 ms +168, 200 ms +266, 400 ms +359, 800 ms +403 px (about 90% caught up by 400 ms).
- Moving to another row slides a vertical strip of thumbnails: `y = −index × 100/count %`, 0.6 s, Power2.easeInOut (measured 0 → −396 px). One frame swaps by **sliding**, not by cutting.
- The row itself: the title moves `translateX(−0.1 × container-padding)` (−18.9 px) and the category moves `+0.1 ×` (+11.5 px). The two halves split apart in opposite directions, 0.3 s `cubic-bezier(.7,0,.3,1)`.
- On touch or mobile the list becomes stacked image cards and nothing follows the cursor (`mobile_03_scroll-y1696.jpg`).

### B6. Link micro-interaction
- Nav links get a **dot**, not an underline: `::after` is a 6.3 px circle under the label, `scale 0 → 1`, 0.3 s `cubic-bezier(.7,0,.3,1)`.
  - Measured scale: 0.002 at 50 ms, 0.21 at 150 ms, 0.92 at 250 ms, 1 at 350 ms.
- The active page keeps its dot. When the pointer is over the group, the dot hides on the others (`.links-wrap:hover`).
- External links use a 1 px line, `scaleX 0 → 1`.
- Evidence: `hover_navlink_before/after.jpg`.

### B7. Text and scroll
- **Line/word mask reveal:** `.span-lines` wraps each word in `span.span-line > span.span-line-inner`, then GSAP animates from `y 100%`, 1 s, power3.out, stagger 0.01 s. `toggleActions: play none none reset`, so it replays on re-entry.
- **Fade-in:** `y 2em → 0`, opacity 0→1, 1.75 s, expo.out, start at "0% 110%".
- **Smooth scroll:** Locomotive (lerp). On desktop one wheel "screen" of 900 px moved about 384 px of content per 8×112 px wheel ticks in my test, so input is heavily damped. On mobile it is native scroll.
- **Scroll-direction marquee:** the giant name strip loops (`xPercent −100`, 18 s, linear) and **reverses direction** when the scroll direction flips (`timeScale ±1`). Measured idle drift: about 116 px/s.
- **Hamburger:** appears after scrolling 30% (`main.scrolled`) at scale 0 → 1 with overshoot `cubic-bezier(0.34,1.5,0.64,1)`, 0.4 s. Measured scale: 0.79 at 150 ms, **1.065** at 250 ms, 1.017 at 400 ms, 1 at 600 ms (`scroll_hamburger-appeared.jpg`).
- **Side menu** (`menu_open_200/450/900ms.jpg`): the panel enters as `translateX(100%+6vw) → 0`, 0.8 s `cubic-bezier(.7,0,.2,1)`. A curved left edge (an ellipse 6vw wide) flattens over 0.85 s. Links slide in from 15vw with 0.03 s staggers (0.10, 0.13, 0.16, 0.19 s delays).
- **Footer:** the light section above ends in a curved bottom that flattens as you scroll (`rounded-div` height → 0, scrubbed). The footer arrow rotates 15° → 0 with scroll. A 1 px box-shadow appears on the hamburger over the dark footer.
- **Micro-details:**
  - Header "© Code by Dennis" expands on hover to "Dennis Snellenberg" (0.5 s `cubic-bezier(.7,0,.3,1)`; the © spins 360°).
  - "Located in the Netherlands" pill with a spinning globe (CSS `globe 5.4s cubic-bezier(0.35,0,0.65,1) infinite`).
  - Footer "LOCAL TIME 06:16 AM GMT+2" (Intl.DateTimeFormat, Europe/Amsterdam, updated every 1 s) and "VERSION 2022 © Edition".
  - Section padding `clamp(5em,21vh,12em)`, container padding `clamp(2.5em,8vw,8em)`.
- Motion tokens: `--animation-fast .3s`, `--primary .5s`, `--smooth .7s`, `--slow .9s`, all `cubic-bezier(.7,0,.3,1)`. Panels use `(.7,0,.2,1)`.
- **Cursor:** the system cursor stays everywhere. Only the work-list "View" bubble acts as a custom cursor, and only while hovering that list.

### B8. Performance and accessibility
- Lighthouse mobile: **Performance 83**, LCP 4.2 s, FCP 1.8 s, TBT 20 ms, CLS 0.058, weight 577 KiB. **Accessibility 75** (fails: heading-order, image-alt, meta-viewport).
- Real Chrome desktop: 24 requests / 549 KB. PerformanceObserver LCP 1,820 ms (hero image), mobile 1,884 ms (the H1). The loader hides this content until about 3.5 s after the words appear.

---

## Not measured or limits
- I did not record a frame-accurate video of either site. Mid-transition evidence is timed screenshots plus sampled computed values.
- Genre's Framer hover transitions are JS variant swaps. Their duration was not readable for the CTA italic swap.
- Whether genre's Vimeo player autoplays after load was not confirmed. The spinner was still showing at 1.2 s and the oEmbed request said `autoplay=false`.
- Dennis's mobile full-page height: native scroll stopped at y = 2,846 while Locomotive reported a limit of 3,690. The mobile shots cover the page to the footer.
- Unthrottled timings are from this Mac's connection. Use the Lighthouse rows for comparisons.
