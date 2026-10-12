# PLAN.md — bar.studio rebuild: AI video creator portfolio

Phase 1 output (research, decisions, installed tooling, build plan). Written 2026-10-12. Read together with `BRIEF.md`; the two files are enough to continue phases 2 and 3 in a fresh session without redoing research.

## 0. Decisions already made by Bar (apply, do not re-ask)

| # | Topic | Decision |
|---|---|---|
| 1 | Contact number | WhatsApp Business. The number itself is a config value (`WHATSAPP_NUMBER` in `i18n/site.json`), Bar fills it in (+972 or +66, digits only, no `+`). |
| 2 | Media host | Cloudflare R2. Bar is buying a custom domain and putting it on Cloudflare DNS. Until it is live, everything targets an rclone remote named `media`, so the switch is config only (`MEDIA_BASE_URL`). |
| 3 | Response promise | "עונה באותו יום" / "Same-day replies". Not "within an hour". |
| 4 | Client names | None for now. Proof row uses view counts (and counts of videos/projects), never client names or logos. |
| 5 | Licensed audio | On the first backfill, report how many Reels return no `media_url`. If over ~25%, propose the "masters folder" fallback (section 4.6). |
| 6 | Showreel | Bar has no 16:9 showreel. Hero uses a loop built from the Reels themselves (section 4.7). Leave a slot where a real showreel drops in later. |
| 7 | PAT expiry | The fine-grained PAT gets the same early-warning check as the Instagram token (section 4.4). |
| 8 | Renditions (approved 2026-10-12, rules 7 + 14) | Two files per Reel: a silent grid preview (first 12 s, max 640 px wide, H.264 CRF 29, no audio, ≤ 2 MB) and a full rendition for the watch-with-sound overlay (full length, max 720 px, CRF 26, AAC 96 kbps), loaded only on tap. Replaces the single 720 px / CRF 28 file in 4.6. |
| 9 | Visibility (2026-10-12) | All Reels are shown, including real players and club kits; no automatic hiding by content. `data/reels.json` holds a `hidden` map of Instagram media IDs that the sync and the build skip. It is empty today; Bar hides a Reel later by adding its ID. |
| 10 | Display font (2026-10-12) | Narkiss Hadash Condensed from Adobe Fonts kit `gce3kmw` (Hebrew + English subset, font-display swap; no domain allowlist needed; self-hosting not allowed). Body: Noto Sans Hebrew (self-hosted variable) and DM Sans. Details: `directions/references/font-kit.md`. |
| 12 | English captions (2026-10-12) | The sync translates each new or edited Hebrew caption to English once with the Claude API (`claude-haiku-5-5`, low effort, for meaning and humor), cached in `data/translations.json` by media ID + caption hash. `captions_en` in `data/overrides.json` always wins. If translation fails, the English card shows no pitch (never Hebrew). The first 15 were translated in the Claude Code session and written to the cache. Code: `scripts/lib/translate.mjs`, `scripts/lib/captions.mjs`. |
| 11 | Token hygiene | The first long-lived token (generated 2026-10-12) was exposed in chat. Rotate it in phase 3 when the GitHub secrets are created, and revoke the old one. |

## 1. Current state of the repo (verified 2026-10-12)

- Static site, no build step. GitHub Pages serves `main` root (legacy build), public repo, no custom domain, no `.github/` workflows.
- Pages: `index.html` (live), `index1.html` (abandoned redesign), Sporta case pages `la-liga.html`, `ifa.html`, `special-olympics.html`, `paralympics.html`, plus `ai-production.html`, `about.html`, resume and LinkedIn-cover HTML/PDF/PNG.
- Every page is `lang="en"` LTR. Contact today: mailto, a Thai `tel:` link, LinkedIn. No WhatsApp, no Instagram link.
- Sporta-owned material to remove in phase 3: `Images/sporta/*` (13 files), `Images/IFA/*` (match art and sub-brand marks made at Sporta), `ISR-1.svg`, `Jerusalem-1-1.svg`, the four case pages above, `index1.html`, 25 "Sporta" string hits in `index.html`, 11 in `la-liga.html`, bio line "Head of Studio, Sporta.Digital", the testimonials array in `index.html` JS, and these client names wherever they appear: La Liga Israel, Israel Football Association, Special Olympics Israel, Israel Paralympic Committee, Winner League, Hapoel Jerusalem, Israel Beach Soccer League. `Materials/` is empty. Resume PDFs mention Sporta as an employer; that is experience, not client branding, and stays unless Bar objects.
- Fonts: Bebas Neue + DM Sans, local woff2, Latin only. Hebrew needs new faces.
- Local tooling: node 25, npm 11, ffmpeg 9, Chrome, `gh` logged in as fainshteinbar. Playwright 1.64 now installed (section 2).
- Instagram @barfainshtein is public. Hebrew bio: "Creative Director & AI … DM the word רעיון", ~1.9k followers, the recent feed is all Reels (Sep 23 to Oct 11, 2026). The bio already uses Instagram DM as a lead path.

## 2. Skills and tooling (track A)

### Installed (project-scoped copies in `.claude/skills/`, telemetry disabled during install)

| Skill | Source | Why |
|---|---|---|
| `redesign-existing-projects` | leonxlnx/taste-skill (428K installs, audits Pass/Pass/Pass) | Audit-then-fix protocol for existing sites. Explicit rules: keep the stack, vanilla CSS when there is no framework, small reviewable diffs. Pure markdown. |
| `emil-design-eng` | emilkowalski/skills (343K, Pass/Pass/Pass) | Best motion rigor available: easing decision tree, duration table, `@starting-style`, reduced-motion that keeps opacity but removes movement, hover gated by `@media (hover: hover)`. Pure markdown. |
| `accessibility` | addyosmani/web-quality-skills (60K, Pass/Pass/Pass) | WCAG 2.2 fixes with code, Lighthouse + axe + manual checklist. Author is on the Chrome team. Pure markdown. |
| `hebrew-rtl-best-practices` | skills-il/localization (654 installs, Pass/Pass/Pass, MIT, "no network required") | The only skill that addresses the default language: logical properties, `:dir()`, bidi isolation for phone numbers and URLs, which icons to mirror, Hebrew font stacks, nikkud line-height, Playwright RTL/LTR screenshot diff. Small author, but read in full, pure markdown. |
| Playwright MCP | microsoft/playwright-mcp (official) | Registered in `.mcp.json` (`npx @playwright/mcp@latest`). For interactive checks. |
| `playwright` devDependency | npm, `package.json` | For scripted screenshot batches (`scripts/shots.mjs`): 5 directions × 2 viewports × 2 languages is a script, not 20 tool calls. Chromium headless shell downloaded. |
| Anthropic `frontend-design` | already present | Design-direction guidance. |

All four SKILL.md files were downloaded, read in full, grepped for scripts/network/hooks/settings instructions, and the installed copies were diffed against the audited copies. They contain only markdown.

### Skipped, and why

| Skill | Reason |
|---|---|
| `design-taste-frontend` (leonxlnx) | Assumes Next.js + Tailwind v4 + Motion, zero RTL content, duplicates Anthropic's `frontend-design`. |
| `high-end-visual-design` (leonxlnx) | A fixed house style (glass cards, double bezels, pill eyebrows, floating island nav). Would homogenize a creative director's site. |
| `impeccable` (pbakaus) | Executes code: a shell launcher downloads a prebuilt binary from GitHub releases into `~/.impeccable/bin`, installs SessionStart/PostToolUse/Stop hooks, and `live` mode runs a localhost server that injects script and CSS into source HTML. Socket flags "gptAnomaly". No injection or exfiltration found, but a third-party binary in the loop on every edit is more than a 5-page static site justifies. Its `critique`/`typeset` overlap `redesign-existing-projects`; `animate` overlaps `emil-design-eng`. Could be trialled later project-scoped with hooks off. |
| `web-design-guidelines` (vercel-labs) | Fetches its rule file from raw.githubusercontent.com at use time, so what was audited is not what runs. `accessibility` covers the same ground offline. |
| `agent-browser` (vercel-labs) | Native Rust CLI; Snyk MEDIUM warning and a Runlayer FAIL HIGH (9/11 files flagged). |
| `playwright` skill (openai/skills) | npx wrapper around `playwright-cli`, Snyk warn, inferior to the official MCP. |
| Visual-QA skills on skills.sh | All under 500 installs; Playwright screenshots plus the two design skills cover it. |

How skills.sh installs work: `npx skills add <owner/repo> --skill <name>` (CLI by vercel-labs). Default scope is the project (`.claude/skills/<name>`); `--copy` gives a plain folder instead of a symlink; the CLI sends anonymous telemetry unless `DISABLE_TELEMETRY=1`.

Sources: skills.sh/docs/cli, github.com/vercel-labs/skills, skills.sh pages and raw SKILL.md for each skill, github.com/pbakaus/impeccable (SKILL.md, scripts/impeccable, .claude/settings.json, reference/live.md), github.com/microsoft/playwright-mcp, skills.sh/api/v1/skills/audit/… for impeccable, agent-browser, web-design-guidelines.

## 3. Conversion and contact channel (track B)

Evidence quality: there are no controlled studies of creative-portfolio conversion. Strong evidence exists only for WhatsApp penetration in Israel, the effect of response speed on lead qualification, browser autoplay policy, and form-field friction. Vendor claims that WhatsApp converts "3–5×" better than forms have no methodology and are treated as anecdotal.

### What converts on video-creator and motion-studio sites

- AI-native studios (The Dor Brothers, Genre.ai) front-load proof and a loud CTA: claim → showreel (muted, "tap for sound") → animated counters (projects, total views) → featured piece with its number ("20M views in 48h") → press row → contact. Classic motion studios (Buck, Giant Ant, Ordinary Folk) let the work carry and bury a newbiz@ email in the footer. Without that reputation, copy the Dor Brothers order.
- None of them shows a 9:16 grid. Bar's work is Reels, so a 9:16 grid is honest and differentiating (opinion). The hero gets a loop built from the Reels (decision 6).
- Thumbnails: muted autoplay loops (Chrome and iOS Safari allow autoplay only when muted, iOS also needs `playsinline`); click opens the full piece with sound.
- Captions with results beat montage. Name the three lanes explicitly: comedy reels, ads, sports and brand films.
- CTA above the fold and repeated after the hero loop, after the grid, and in the footer. Strongest wording seen: "Start a project".
- Forms: each extra field costs conversion (HubSpot's 40k-form analysis; making phone optional cut abandonment from 39% to 4% in a ClickTale test). No form in v1.

### Channel data

- WhatsApp: 98% of Israelis use it, 95% daily (Israel Internet Association 2024 via Globes; Statista/ISOC Jan 2024). No Israeli B2B-specific study exists.
- Speed is the measured lever: HBR/Oldroyd audit of 2,241 firms, replying within an hour made a lead about 7× more likely to be qualified; average response was 42 h and 23% never replied.
- International: US/UK B2B default is still email. A Guild survey says 78% of professionals who use WhatsApp for work want an alternative (vendor-biased). WhatsApp must never be the only path.
- Instagram DMs from non-followers land in Requests and get missed. Keep "DM רעיון" as discovery, not intake.
- Calendly-style booking works as step 2 inside the chat, not as the first click.
- `wa.me` mechanics: `https://wa.me/<countrycode+number>?text=<encodeURIComponent(msg)>`, no `+`, no leading 0. Hebrew works (UTF-8 percent-encoded). Nothing is sent until the user taps send. Desktop shows an interstitial then hands off to the desktop app or web.whatsapp.com.

### Decision

- Primary: WhatsApp click-to-chat on the WhatsApp Business number. Prefilled text, HE: "היי בר, ראיתי את האתר. אני מ[חברה] ומעניין אותי סרטון AI ל[מטרה]." EN: "Hi Bar, saw your site. I'm from [company] and I'm interested in an AI video for [goal]."
- Secondary: `mailto:` with a prefilled subject, address also shown as plain text (bidi-isolated).
- Tertiary: Instagram link labelled "more work", never as the contact path.
- Promise next to every CTA: "עונה באותו יום" / "Same-day replies" (decision 3).
- Placement: sticky WhatsApp button (mobile bottom corner on the inline-end side, desktop header), CTA under hero, after grid, footer. Same wording everywhere.
- Proof stack (decision 4, no client names): aggregate view count across Reels from API insights → number of videos / lanes → 1–2 results-captioned cards ("X views in 48h", only real numbers from the API) → 2–3 short quotes with name and role only if Bar gets permission → press if any.
- CTA copy direction: verb + outcome + low commitment. HE "בואו נדבר על הסרטון שלכם" / "שלחו לי בוואטסאפ". EN "Start a project" / "Tell me about your video".

Sources: thedorbrothers.com, genre.ai, buck.co, giantant.ca, ordinaryfolk.co, developer.chrome.com/blog/autoplay, webkit.org/blog/6784, en.globes.co.il/en/article-1001484162, statista.com/statistics/1622109, hbr.org/2011/03/the-short-life-of-online-sales-leads, uxmovement.com/forms/research-based-tips-for-a-better-contact-form, techcrunch.com/2024/11/01/instagram-upgrades-dms-with-focus-on-creators, guild.co/blog/10-reasons-you-shouldnt-be-using-whatsapp-for-work, faq.whatsapp.com/5913398998672934.

## 4. Video delivery (track C)

### 4.1 Constraints from the brief, confirmed

Instagram embeds are unusable for the grid (heavy, Instagram chrome, no clean muted loop). The API returns media only for professional accounts, and the Instagram-Login flavour explicitly supports both Business and Creator accounts without a Facebook Page. `media_url` and `thumbnail_url` are expiring signed CDN URLs, so files must be re-hosted. Video must not live in git: GitHub Pages has a 1 GB site limit and a 100 GB/month soft bandwidth cap, and LFS is not served. There is no sanctioned no-token way to list a profile's posts (oEmbed takes one post URL at a time).

### 4.2 API

- Instagram API with Instagram Login, host `graph.instagram.com`, pin `v26.0`. Basic Display is dead since 2024-12-04.
- Scopes: `instagram_business_basic`, plus `instagram_business_manage_insights` for the `views` metric (`plays`/`video_views` are deprecated).
- App Review is not required when the app only reads an account the developer owns (Standard Access). The app can stay in Development mode (inferred, not stated in docs).
- The App Dashboard "Generate token" button issues a long-lived 60-day token directly, so the client secret never needs to be in CI.
- Calls: `GET /me?fields=user_id,username`, then `GET /{IG_ID}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50`, follow `paging.next`. Optional `GET /{id}/insights?metric=views`. Filter `media_type=VIDEO`. Up to 10K recent media. Rate limit 4800 × impressions per 24 h, irrelevant for a daily job.
- Documented risk: Reels with licensed audio return no `media_url`. Fallback in 4.6.
- Unverified: max `limit` (third-party says 100), `media_product_type` on the Instagram-Login flavour, that `media_url` is always mp4 (empirically true).

### 4.3 Token lifecycle

- Refresh: `GET /refresh_access_token?grant_type=ig_refresh_token&access_token=…` when the token is at least 24 h old and not expired. An unrefreshed token dies at 60 days and cannot be revived; only Bar can regenerate it.
- Persist: the weekly refresh job rewrites the repo secret with `gh secret set IG_ACCESS_TOKEN` authenticated by a fine-grained PAT (`GH_SECRETS_PAT`, this repo only, Secrets: read/write, Variables: read/write). `GITHUB_TOKEN` cannot write secrets.
- Store `IG_TOKEN_EXPIRES_AT` as a repo variable after every refresh.

### 4.4 Early-warning checks (both tokens)

- Every run of the sync job starts with a `check-tokens` step: fail the run if `IG_TOKEN_EXPIRES_AT` or `GH_PAT_EXPIRES_AT` is under 7 days away, or if a test call with either token fails.
- `GH_PAT_EXPIRES_AT` is set by Bar once when he creates the PAT (GitHub shows the expiry on creation; recommend 366 days, the maximum, and a calendar entry). The job cannot read the PAT's expiry via API, so the variable is the source of truth.
- Alerting: a failed scheduled run emails the workflow author; a `failure()` step also opens a GitHub issue titled "Instagram sync needs attention: <reason>" with the exact fix steps. The issue step is idempotent (search for an open issue with the same title first).

### 4.5 Hosting

60 videos now, +10/month, ~5k visitors × 6 videos ≈ 30k loads/month. Transcoding cuts traffic from ~455 GB to ~90 GB/month.

| Option | Est. $/month | Notes |
|---|---|---|
| Cloudflare R2 + custom domain | $0 | Zero egress; free tier 10 GB storage, 1M Class A, 10M Class B. Custom domain requires the DNS zone on Cloudflare. The `r2.dev` URL is documented as not for production (rate-limited, uncached). **Chosen (decision 2).** |
| Bunny Storage + CDN | ~$1 | Works with a `*.b-cdn.net` hostname, no domain needed. Fallback if the domain is delayed. |
| Bunny Stream | ~$2.3 | HLS player JS, not plain `<video src>`. |
| Cloudflare Stream | ~$12.5 | Overkill, HLS. |
| Cloudinary free | not viable | Video bandwidth is paid-plans only. |
| GitHub Pages / jsDelivr | not viable | Bandwidth cap, video in git, 20 MB file cap on jsDelivr. |

Upload from Actions with `rclone copy` to a remote named `media` configured from secrets. R2 is S3-compatible; the remote is defined by env vars (`RCLONE_CONFIG_MEDIA_TYPE=s3`, `RCLONE_CONFIG_MEDIA_PROVIDER=Cloudflare`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, access key, secret). Switching host later means changing those env vars and `MEDIA_BASE_URL`.

### 4.6 Sync job design (`scripts/ig-sync.mjs`, Node, zero runtime deps)

1. Check tokens (4.4).
2. Fetch all VIDEO media, with insights `views` where available.
3. Diff against `data/instagram.json`. For new IDs: download `media_url` (mp4) and `thumbnail_url` in the same run (URLs expire).
4. Transcode with ffmpeg (installed via apt; not preinstalled on `ubuntu-24.04`): `-vf scale=720:-2 -c:v libx264 -preset slow -crf 28 -an -pix_fmt yuv420p -movflags +faststart` → roughly 2–3.5 MB per 15 s Reel (4–6× smaller; estimate). Poster: WebP from the frame at 0.3 s, 720 px wide, ~30–60 KB. LQIP: 24 px WebP as a data URI (~1 KB), stored in the manifest.
5. Upload `videos/<id>.mp4`, `posters/<id>.webp` to the `media` remote.
6. Rebuild the hero loop (4.7) when new items arrived.
7. Write the manifest, run `scripts/build.mjs`, commit `data/`, `index.html`, `en/index.html` with `GITHUB_TOKEN` (`contents: write`). The commit triggers the Pages deploy and keeps the repo "active".
8. Report: the run summary (`$GITHUB_STEP_SUMMARY`) lists new items, items without `media_url`, and the percentage without `media_url` over the whole account (decision 5). The first backfill run is where that number matters.

Items without `media_url` get `has_video: false`, keep their poster (thumbnail is still returned) and permalink, and render as a poster card that opens Instagram. If the share is over ~25%: the "masters folder" fallback. Bar drops the original exports into `masters/<ig_media_id>.mp4` in the R2 bucket (or `masters/<any-name>.mp4` plus a `masters/map.json` of filename → permalink); the job lists that prefix, treats a master as the source for that id, and transcodes it exactly like an API download. No change to the site code.

Manifest shape (`data/instagram.json`): `{ "generated_at", "media_base_url", "stats": { "total_videos", "total_views", "missing_media_url", "missing_media_url_pct" }, "items": [{ "id", "permalink", "timestamp", "caption", "lane", "has_video", "video_url", "poster_url", "lqip", "width", "height", "duration", "views", "likes" }] }`. `lane` is derived from caption hashtags Bar controls (`#ad`, `#comedy`, `#sport`) with a manual override file `data/overrides.json`; items without a hashtag default to "reels".

Schedule: `cron: "23 4 * * *"` plus `workflow_dispatch`, `concurrency: { group: ig-sync, cancel-in-progress: false }`, runner pinned to `ubuntu-24.04` (`ubuntu-latest` moves to 26.04 between Oct 19 and Nov 19, 2026). Weekly `ig-token-refresh.yml` on `cron: "41 5 * * 1"`. Public repos get hosted runners free. Scheduled workflows are auto-disabled after 60 days without repo activity; the sync job's own commits keep it active (widely reported, not found in docs), and the refresh job commits `data/last-sync.json` weekly as a belt-and-braces measure.

### 4.6.1 Status (2026-10-12)

`scripts/ig-sync.mjs --local` is implemented and run against the real account: @barfainshtein (MEDIA_CREATOR), 17 videos, 0 without media_url, 418K views across all 17, top Reel 210K. It writes `media/ig/` and `data/instagram.local.json` (both gitignored); the build prefers the local manifest, and `MANIFEST=fixture` forces the committed fixture before commits. Manifest items now also carry `visible`, `status`, `full_url`; stats carry `top_visible_views`, `top_visible_id`, `shown`, `hidden`. The CDN upload mode (`rclone` to R2, `data/instagram.json`) is still phase 3. Shared pipeline: `scripts/lib/media.mjs`.

### 4.7 Hero loop from the Reels (decision 6)

The sync job builds `hero/loop.mp4` (16:9, 1280×720, 20–30 s, no audio, CRF 28) from the newest 6–9 Reels: each Reel contributes a 3 s segment, cropped to a center 9:16 column and tiled 3-up side by side (three vertical columns fill a 16:9 frame naturally), with 0.3 s crossfades between groups. Also a 9:16 variant for mobile (`hero/loop-portrait.mp4`, one Reel at a time, 2.5 s each). Poster frames for both. The build picks which Reels via `data/overrides.json` (`hero: [ids]`) when set, otherwise the newest with `has_video`. Slot for a real showreel later: if `hero/showreel.mp4` exists in the bucket, the build uses it instead of the generated loop and shows a "watch with sound" control; nothing else changes.

### 4.8 Front-end rules for LCP < 2.5 s

Chrome counts a video's poster or first frame as the LCP candidate. So: every card has `preload="none"` and a `poster`; the hero poster is in the initial HTML with `<link rel="preload" as="image" fetchpriority="high">` and is never lazy-loaded; `preconnect` to the media host; an IntersectionObserver sets `src` and calls `play()` at ≥50% visibility and pauses off-screen; concurrent playing videos capped (2 on narrow viewports, 4 desktop); `muted playsinline loop`; `prefers-reduced-motion` → poster plus play button; `navigator.connection.saveData` → posters only; explicit width/height on posters to avoid CLS. The grid is baked into HTML at build time (no client-side fetch before LCP).

### 4.9 Bootstrap

Run the workflow by hand (`workflow_dispatch`) as soon as the token exists; it backfills all historical media. If the token is delayed, phase 2 uses placeholder loops generated locally with ffmpeg (`assets/placeholders/`, committed, small).

Sources: developers.facebook.com/docs/instagram-platform (overview, instagram-api-with-instagram-login, get-started, business-login, app-review, reference/instagram-media, reference/instagram-media/insights, oembed, changelog), developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api, developers.facebook.com/docs/graph-api/overview/rate-limiting, developers.cloudflare.com/r2 (pricing, public-buckets, platform/limits, api/tokens, examples/rclone), developers.cloudflare.com/stream/pricing, bunny.net/pricing (storage, cdn, stream), cloudinary.com/pricing, docs.github.com (pages limits, workflow-syntax, events-that-trigger-workflows, disabling-and-enabling-a-workflow, fine-grained PAT permissions, dependency-caching, notifications-for-workflow-runs, actions billing), cli.github.com/manual/gh_secret_set, github.com/actions/runner-images Ubuntu2404-Readme, github.blog/changelog/2026-09-17-ubuntu-26, web.dev/articles/lcp, web.dev/articles/optimize-lcp, web.dev/articles/fast-playback-with-preload, webkit.org/blog/6784.

## 5. Owner-only setup checklist (Bar)

1. Meta for Developers: create an app of type Business, add the Instagram product, under "API setup with Instagram business login" add @barfainshtein as an Instagram tester, accept the invite in the Instagram app.
2. Click "Generate token" in the app dashboard → long-lived 60-day token. Note the expiry date shown.
3. Cloudflare: add the new domain as a free zone; R2 → create bucket `bar-studio-media`; connect custom domain `media.<domain>`; create an R2 API token with Object Read & Write scoped to that bucket → Access Key ID, Secret, Account ID.
4. GitHub: fine-grained PAT for this repo only, permissions Secrets: read/write, Variables: read/write, Metadata: read; 366-day expiry; note the expiry date.
5. Repo secrets: `IG_ACCESS_TOKEN` (a fresh token; revoke the one exposed on 2026-10-12), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GH_SECRETS_PAT`, `ANTHROPIC_API_KEY` (Claude API key from console.anthropic.com, used by the sync to translate new captions to English with `claude-haiku-5-5`; cost is a few cents a month because each Reel is translated once and cached).
6. Repo variables: `MEDIA_BASE_URL` (e.g. `https://media.<domain>`), `R2_BUCKET=bar-studio-media`, `IG_API_VERSION=v26.0`, `IG_TOKEN_EXPIRES_AT` (ISO date), `GH_PAT_EXPIRES_AT` (ISO date).
7. Fill `WHATSAPP_NUMBER` in `i18n/site.json`.
8. Run the "Instagram sync" workflow once by hand; read the run summary for the missing-`media_url` percentage.

Phase 3 will restate this list in the repo README with exact click paths.

## 6. Build plan

### 6.1 Target architecture (static, no framework)

```
src/                    page templates (index.html + partials) with {{i18n.key}} placeholders
i18n/he.json, en.json   every string, including meta, OG, alt text
i18n/site.json          WHATSAPP_NUMBER, email, instagram handle, media base URL
data/instagram.json     manifest written by the sync job; data/overrides.json (lanes, hero picks)
assets/css|js|fonts|img|placeholders
scripts/build.mjs       Node, zero deps: renders / (he, dir=rtl) and /en/ (en, dir=ltr), injects manifest, hreflang, per-language meta, JSON-LD
scripts/ig-sync.mjs     fetch → diff → download → ffmpeg → rclone upload → hero loop → manifest → build
scripts/shots.mjs       Playwright: screenshots of given URLs at 390 and 1440 px, he + en
.github/workflows/ig-sync.yml, ig-token-refresh.yml
directions/1..5/        phase 2 only
```

- Two URLs per page, required for hreflang: `/` Hebrew default, `/en/` English, `x-default` → `/`. The header toggle switches path; `localStorage` remembers the choice for return visits but never auto-redirects.
- Build output is committed, so GitHub Pages keeps its legacy branch deploy. The sync job runs the build after updating the manifest.
- RTL: logical properties only, `:dir()` selectors, bidi isolation for numbers, phone and URLs, mirrored directional icons, no `translateX` without a mirrored rule. Hebrew-capable fonts, self-hosted subset woff2, display font preloaded. Candidates for the directions: Heebo, Rubik, Secular One, Frank Ruhl Libre, Noto Sans Hebrew, each paired with a Latin face.
- Palette kept: void #07071C, navy #1A1464, cyan #00C2FF, cream #F4F0E8.

### 6.2 Phase 2: five directions

- Each `directions/N/index.html` is self-contained with its own CSS and covers the full home page: hero with the Reels loop, 9:16 grid, lanes (comedy reels / ads / sports and brand films), proof row (view counts, no client names), about/why-me, process, WhatsApp CTA with "Same-day replies". Hebrew and English from the same i18n JSON. Real Reels if the manifest exists, otherwise ffmpeg-generated placeholder loops in motion.
- Five genuinely different axes, not five palettes. Working list: (1) broadcast/sports-graphics density, (2) cinematic dark full-bleed loop-first, (3) feed-native phone-frame grid, (4) brutalist Hebrew display type, (5) light cream studio minimal. Finalize at build time using `frontend-design` and `redesign-existing-projects`.
- `scripts/shots.mjs` captures 5 × {390, 1440} × {he, en} = 20 screenshots into `directions/shots/`. Pick the strongest with reasons referring to the screenshots. Stop at the checkpoint.

**Status (2026-10-12):** phase 2 done and committed, with six directions. Direction 6 ("current site, evolved") was added at Bar's request, along with `scripts/import-reels.mjs` for swapping real Reels into every direction. Comparison, live-site audit, Lighthouse table and the recommendation (6, with 1 Matchday a close second) are in `directions/README.md`. Bar chose direction 6 as the base with a work-first premise (genre.ai structure, Dennis craft). The 14 rules were confirmed and direction 6 was rebuilt on them with the real Reels (step 5, see the end of `directions/README.md`). Next: phase 3, the production build at `/` and `/en/` from this direction. The WhatsApp number lives in `i18n/site.json` (`972536224344`). Reusable pieces for phase 3: `assets/js/reels.js`, `assets/css/base.css`, `scripts/build-directions.mjs` (template engine and head/hreflang logic to lift into `scripts/build.mjs`), `scripts/shots.mjs`, `scripts/serve.mjs`, `scripts/make-placeholders.sh` (its hero-loop step is the 4.7 recipe).

### 6.3 Phase 3: build (after Bar's choice)

1. Remove Sporta material listed in section 1. Leave thin redirect stubs for the deleted case URLs (they are linked from LinkedIn and the resume) pointing to `/`.
2. Implement the chosen direction as `src/` + build; Hebrew default + English; video grid per 4.8; copy drafted from the current site and the Instagram bio, every invented number, claim or client marked `[UNVERIFIED]` in both languages.
3. Sync job, token refresh job, early-warning checks, README checklist (section 5).
4. Verification: Lighthouse mobile (`npx lighthouse --preset=mobile` locally plus PageSpeed on the deployed URL) until performance ≥ 90 and LCP < 2.5 s; `scripts/shots.mjs` over every page × language × viewport; a Playwright check that `video.currentTime` advances in view and stops out of view; a dry run of `ig-sync.mjs` against a fixture when the token is missing; `grep -ri sporta` and a client-name grep over the repo.
5. Commit after each phase.

## 7. Suggestions outside the brief (not planned)

- The Thai `tel:` link on the live site should go regardless of the WhatsApp decision; a phone number without a WhatsApp wrapper gets fewer taps and leaks the personal number.
- `Bfain Logo.jpg` (3 MB) and the two hero PNGs (1.2 MB each) are committed at full size; phase 3 can drop or compress them when the hero changes.
- Once the custom domain exists, move the whole site to it (CNAME in the repo) so the Instagram bio link and the media host share one brand.
