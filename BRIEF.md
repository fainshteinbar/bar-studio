# BRIEF — bar.studio rebuild: AI video creator portfolio

<context>
I'm Bar Fainshtein, a creative director who now specializes in AI-generated video (Seedance and similar tools): comedy reels, ads, sports and brand films. My current site lives in this repo and is deployed at https://fainshteinbar.github.io/bar-studio/ (GitHub Pages). We built it together in earlier sessions.

The current site shows graphics I made while employed at Sporta Digital. I can't use them as my own portfolio anymore, so they have to go. My skills and experience can stay — only the Sporta-owned visuals and any client names that belong to Sporta come out.

My work lives on Instagram: https://www.instagram.com/barfainshtein/ — I publish new videos there all the time, and I will not maintain the site by hand.

Audience: brands, agencies, sports clubs and businesses who want AI video. Primary market Israel, secondary international.
Existing brand palette (keep unless the design research gives a strong reason to change): void #07071C, navy #1A1464, cyan #00C2FF, cream #F4F0E8.
</context>

<goal>
A portfolio site for "Bar — AI video creator" that looks at the level of top-tier studio sites (think the polish of 433 / UEFA / premium agency sites) and turns visitors into leads.

Definition of done:
1. No Sporta-owned graphics or Sporta client branding anywhere in the site or the repo history going forward.
2. Hebrew is the default language (RTL), with an English (LTR) toggle. Every string is translated, layout mirrors correctly, hreflang and per-language meta are set.
3. My Instagram videos appear on the site and stay in sync automatically when I post — zero manual steps from me after initial setup.
4. Fast: Lighthouse mobile performance ≥ 90 and LCP under 2.5s on the home page, with the video grid included.
5. A clear about / why-me section and a lead path (contact CTA) chosen on the basis of research, not guesswork.
6. Final design was chosen from 5 distinct directions, verified in a real browser with screenshots.
</goal>

<phase_1_research>
Do this before building anything. Report findings in a short written summary with sources.

A. Skills. Go to https://www.skills.sh/ and evaluate design and QA skills that would raise the quality of this site. Start with these, then look for anything better:
- leonxlnx/taste-skill (design-taste-frontend, redesign-existing-projects, high-end-visual-design)
- emilkowalski/skills (emil-design-eng)
- pbakaus/impeccable (impeccable)
- a Playwright skill or the Playwright MCP, for browser testing and screenshots
These are third-party code that will run on my machine, so read each SKILL.md and check its skills.sh audit before installing. Install only what you'd defend; tell me what you installed and why, and what you skipped.

B. Conversion. Research what makes portfolio sites for video / AI-video creators convert visitors into inquiries: page structure, how work is displayed, proof (results, view counts, brands), CTA placement. Specifically decide the primary contact channel — WhatsApp click-to-chat with a prefilled message, Instagram DM, a form, or a combination — for an Israeli-first audience that also includes international clients. Give a recommendation and the reasoning.

C. Video delivery. Decide how to show Instagram videos fast and in sync. Known constraints to verify:
- Instagram embeds/iframes are heavy, show Instagram UI, and don't give clean muted autoplay loops — likely too slow for goal #4.
- The Instagram API only returns media for professional (Creator/Business) accounts, and its media URLs are temporary, so videos must be re-hosted rather than hot-linked.
- Videos should not be committed to the git repo (size limits).
Expected direction unless research shows something better: a scheduled job (e.g., GitHub Actions cron) that pulls new media via the Instagram API, stores mp4 + poster image on a video/CDN host (e.g., Cloudflare R2, or a separate GitHub Pages media repo — compare cost for my volume), and writes a JSON manifest the site reads. Include token refresh so it doesn't silently break after 60 days.
My account is set up as a Creator (professional) account, as far as I know — confirm this works with the API you choose.

Phase 1 output: write PLAN.md in the repo root with findings, decisions, installed skills and the build plan. Later phases may run in a fresh session on a different model, so PLAN.md plus this brief must be enough to continue without redoing the research.
</phase_1_research>

<phase_2_design_directions>
I'm not going to describe the look — I'm telling you what it needs to achieve (see goal). Build 5 genuinely different design directions, each as its own page I can open locally (e.g., /directions/1 … /directions/5). Each direction covers the home page: hero, video work grid, about/why-me, and contact CTA — with real content, not lorem ipsum. Use real Instagram thumbnails/videos if the feed is ready, otherwise representative placeholders I can see in motion.

Then:
1. Open each direction in a real browser (Playwright), desktop and mobile, Hebrew and English. Take screenshots.
2. Pick the strongest one and explain why in a few sentences, referring to the screenshots — what works, what the others got wrong.
3. Stop here and wait for my choice. This is the one planned checkpoint in the project.
</phase_2_design_directions>

<phase_3_build>
After I choose, build the full site in that direction:
- Remove all Sporta-owned visuals and client branding; keep and rewrite my skills/experience for an AI-video positioning.
- Hebrew default + English toggle, as defined in the goal.
- Video grid fed by the manifest from phase 1C: muted, looping, plays only when in view, poster-first, lazy-loaded.
- About / why-me / process / CTA copy: draft it from the current site and my Instagram, in Hebrew and English. Mark anything you invented (numbers, claims, client names) so I can confirm it — never present a guess as fact.
- Set up the Instagram sync job. Some steps need me (switching the account to professional if needed, creating the Meta app, generating the token, adding secrets). Prepare everything else and give me those steps as a short exact checklist.
</phase_3_build>

<verification>
Before you call it done:
- Run Lighthouse (mobile) and report the scores; fix until goal #4 is met.
- Use Playwright to screenshot every page in both languages on mobile and desktop; check RTL mirroring, broken layouts, and that videos actually play.
- Run the sync job once end-to-end (or a dry run if the token isn't set yet) and show the resulting manifest.
- Grep the repo for leftover Sporta assets and client names.
</verification>

<working_rules>
- Work autonomously. Apart from the phase 2 checkpoint and steps only I can do (accounts, tokens, secrets), don't stop to ask permission for work this brief already covers. If something is ambiguous, make the call a careful senior designer-developer would make, state the assumption, and keep going.
- If you think part of this brief is wrong, say so in a sentence or two and continue under a stated assumption.
- Before you start each phase, say in a line what you're about to do. End with a recap that stands on its own: what you found, what you did, what's left for me.
- Keep changes to what this brief asks for. Other improvements you notice go in the recap as suggestions.
- Prefer targeted edits over rewriting whole files.
- Commit after each phase with a clear message, so any step can be rolled back.
</working_rules>
