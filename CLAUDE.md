# Grad Jobs Platform - Build Brief

This file is the project brief. Read it at the start of every session and follow it.

## Who you are working with
- Owner: Mihir, final-year Sports Management student (Loughborough). NOT a developer, learning as he builds.
- Explain every step in plain English, no jargon without a one-line explanation.
- Ask for each account or API key only at the moment you need it. Never ask him to paste keys into chat; store them in environment variables / .env files that are git-ignored. Never hard-code secrets.
- Work in small steps: plan the next unticked item, explain it simply, build, let him test in the browser, then commit and deploy.
- Do not add features, services or costs that are not in this brief. If something new seems needed, say so and ask first, with an honest "needed or not" and the cost.

## What the platform is
A private web app (installable on phone as a PWA) that finds UK graduate roles starting in 2027, for Mihir, his girlfriend (main users) and a few friends (max ~6-7 users).
- All users hold foreign (e.g. Indian) passports. Assume every user is on the 18-month Graduate route visa. Mihir's runs from 31 October 2027 to 30 April 2029 (Mihir, 10 Nov 2026): that is the period he needs no sponsorship. Do NOT ask users visa questions.
- Goal: catch 95%+ of publicly advertised UK graduate roles, proven by a daily coverage score.

## Cost rule (important)
- Target running cost: about GBP 13/month for the two main users.
- Free data first. Use AI only where free rules cannot do the job, and only when a user actually opens, saves or edits something.
- One overall monthly spend cap in the Anthropic Console.

## Tech stack
- App: Next.js, installable as a PWA, hosted on Vercel (free tier).
- Database, logins, CV storage: Supabase (free tier). Each user sees only their own data (row-level security).
- Semantic search: pgvector in Supabase with a free open-source embedding model (no paid embedding API).
- Daily data job: GitHub Actions scheduled workflow (free).
- Email: Resend (free tier). Instant alerts: Telegram bot. Error alerts: optional (Sentry free tier) only if needed later. Code: GitHub.
- AI (Anthropic API):
  - Claude Haiku 5.5: role breakdown when a user opens/saves a role; classifying inbox-sync emails.
  - Claude Sonnet 5.5: occupation codes for roles a user opens, company summaries, turning a user's typed goals into bullets.
  - Claude Opus 5.5: CV recommendations and rewrites, keyword gap analysis, cover letter recommendations, interview prep.
  - Use the Batch API (50% off) for overnight work and prompt caching for repeated content (CV, story bank).
- No "why it fits you" AI write-ups per role.

## Data sources and coverage (backbone first)
Source-first principle: almost every graduate role is first posted on the employer's own hiring system; boards mostly copy it. So watch employers directly, and use boards/Google as cross-checks.
1. Aggregator APIs: Reed (free key; has expiry dates and a graduate filter). Adzuna is OFF at launch: it now costs GBP 8/month after 25 free test calls, and Google Jobs largely overlaps it. Use the 25 test calls in Stage 1 to measure how many Adzuna roles Reed + Google Jobs miss; only subscribe if the gap is real (and show the "Jobs by Adzuna" credit if used).
2. Employer hiring-system feeds: Greenhouse, Lever, Ashby, SmartRecruiters, Workable public job feeds.
3. Employer career pages on other systems (e.g. Workday): read the job data the page loads / its structured JobPosting data, daily for top grad employers, weekly for the long tail. AI only as a fallback.
4. Google Jobs search via a cheap third-party search-results API (e.g. DataForSEO), ON from Stage 1, as the main cross-check (~GBP 4/month of usage). DataForSEO is prepaid: $1 free credit at sign-up for testing, then a one-time $50 minimum top-up that lasts many months; no subscription. Build and test on the free credit first. Note: grey area under Google's terms; risk sits with the provider.
5. Alert inbox: optional, OFF at launch.
6. Coverage loop: any role found by Reed or Google Jobs but missing from the employer feeds triggers discovery of that employer's careers system (free: from the apply link, or standard ATS addresses) and adds it to the watch list. Track which sources found each role; show a daily coverage score and the "found only by Google Jobs" share on the admin page.
- Every role found by any source goes into the feed the same day.
- Master employer watch list: tens of thousands of employers, grown for free from apply links and the coverage loop (no paid careers-page search).
- Never scrape or automate LinkedIn, Indeed or Glassdoor (their terms ban it). Never scrape grad boards; link out to apply.
- Tag listings with FREE text rules (no AI): degree grade (2:1 etc.), sponsorship wording ("unable to sponsor"), assessment stages, driving licence required, start date, deadline, contract length.
- Other free data: Home Office register of licensed sponsors (CSV from GOV.UK, refresh daily); Companies House API; GOV.UK Skilled Worker going rates; ONS earnings for salary context.

## Visa logic (store all thresholds as editable settings, not hard-coded)
- Sponsor status is INFORMATION, not a filter. On the Graduate visa any employer can hire without sponsorship.
- Sponsor match: employer name + town vs the register -> Likely / Unclear / Not listed.
- Salary rules (GOV.UK, check before building): standard GBP 41,700 or the going rate; new entrant (under 26 / Student or Graduate visa) at least GBP 33,400 and 70% of going rate; new-entrant rates capped at 4 years total stay including Graduate visa time. Role must be degree level (RQF 6).
- Graduate route: 18 months for applications from 1 Jan 2027, counted from approval (assumed 31 October 2027, stored in the `visa.assumed_approval_date` setting).
- Roles whose wording rules out a time-limited visa (e.g. "right to work that is not time limited", "permanent right to work") are never removed: they stay visible with the "Says no sponsorship" flag (Mihir, 10 Nov 2026).
- Visa fit line per role: Fits easily (scheme ends before visa) / Switch possible (longer scheme, licensed sponsor, salary meets new-entrant rules) / Ask early (longer scheme, unclear or not listed). Never hide long schemes by default.

## Platform sections
1. All roles: every open role, complete and never filtered behind the user's back. Search plus filters (sector, location, salary, start date, deadline, sponsor status, company, source). Profile answers with their switch off appear here as one-tap filters.
2. For You (name TBD): roles matching the profile answers whose "Use in For You" switch is on. Matched tags on each role (e.g. "Marketing - London - July start"). Daily digest and instant alerts come from here.
3. Saved: one tap to save from any section; deadline countdowns; "may have closed" warning; move to Apply.
4. Apply: roles the user will apply for, with:
   - Company brief: what they do, values and mission in their own words, recent news, what they want in grads.
   - Keyword gap analysis vs the user's CV.
   - CV recommendations and a CV rewrite for the role (Opus), built only from the user's story bank; never invents experience.
   - Cover letter recommendations: a structure and 4-6 points to include. NEVER write the cover letter.
   - "Sounds like AI" check on the user's own drafts.
   - Documents used: save the exact CV and cover letter submitted; any CV can be marked a master template for similar roles (suggest the closest template for new similar roles).
   - Applied history with date, documents used and status.
- Nothing is ever submitted on the user's behalf.

## Role cards
The role (title, salary actual/estimated, location, start date, deadline, contract type); Requirements; The company (what they do in 3 lines, values, HQ/offices, age, size, recent news); Visa (sponsor status info, salary check, visa fit); Process (stages when stated); Salary context.

## Profile page (no sign-up questionnaire; everything lives here, editable any time)
Each question has a "Use in For You" switch. On = shapes For You. Off = saved, available as a filter in All roles.
| Question | Options | Switch default |
|---|---|---|
| CV | upload | n/a |
| What roles are you looking for? | ~15 main fields to tick: Sports business and partnerships; Marketing and brand; Sales and business development; Consulting; Finance and accounting; Banking and investment; Operations and supply chain; Project management; HR and people; Data and analytics; Technology; Media, communications and PR; Events and hospitality; Retail and FMCG commercial; Public sector and policy. Plus searchable full list | On |
| What do you want from your first role? | free text, e.g. "lets me express my creativity in design"; AI turns it into editable must-haves (filter) and nice-to-haves (rank); matching understands meaning | On |
| Prioritise visa sponsors | ticked by default | Off |
| Preferred locations | London, Manchester, Birmingham, Edinburgh to tick + search; abroad by country with region shortcuts (Europe, Middle East, North America, Asia-Pacific, India). Ticked rank higher, nothing removed | Off |
| Desired salary | Any, 24k+, 28k+, 30k+, 33.4k+ (new-entrant floor), 35k+, 40k+, 45k+. "Competitive"/no salary stays visible, tagged, with an estimate where a source provides one | Off |
| Don't show | 6 toggles, all OFF by default: non-sponsor companies; driving licence required; schemes longer than 18 months; starting before June 2027; starting after Sept 2027; non-ticked locations. Applies to For You only. Roles whose listing doesn't state the detail stay visible, tagged "not stated" | n/a |
- No start-window question and no visa questions. Default: small ranking boost for July 2027 starts.
- Story bank (raw notes on real experiences) is requested the first time the user opens Apply.
- Ranking in For You: fields + typed goals, then other switched-on answers (sponsors, locations, salary), then the July boost.

## Supporting tools
- Dashboard: pipeline Applied -> Test -> Interview -> Assessment centre -> Offer / Rejected; interview dates; response rates.
- Follow a company: notify the day it posts a role.
- Opening soon: flags from employers' "register interest" pages; from year two, the grad scheme calendar (record open/close dates).
- Inbox sync: each user connects their own personal email (read-only, opt-in, revocable). Only emails from employers applied to and their hiring systems are processed; nothing else stored. Detects received / test invite / interview / assessment centre / rejection / offer; updates dashboard and history; extracts dates as reminders; flags no reply after a set number of weeks. Free rules filter, Haiku reads only relevant emails. Note Google's restrictions on apps reading Gmail (testing-mode tokens expire after 7 days); set up to avoid weekly reconnection where possible.
- Alerts: daily email digest; Telegram instant alerts for deadlines and followed companies; deadline countdowns at 7, 3 and 1 day plus closing day; rolling roles get "apply soon" and a nudge 14 days after saving; closed-role warning when a listing disappears.
- Accounts and exact costs: separate private accounts; one spend cap; share a role with each other. Exact cost tracking: daily pull from Anthropic's Usage and Cost API (needs an Admin API key; the Admin API is unavailable for individual organizations, so in Stage 3 check whether the Grad Jobs org can be converted in Settings > Organization; if not, use per-request token logging plus the Console's Cost page; server-side only, read-only use), log real token counts per request (input, output, cache, web search), split per user scaled to the official total. Show USD (matches Console) plus approximate GBP. At cost, no markup.
- Later, once the core works: career/networking events, internships and insight days, interview prep packs, international roles.
- Networking (Mihir, 27 Oct 2026): hiring manager / recruiter contact per role wherever possible (from the listing or the employer's own page; LinkedIn only as a link the user opens, never scraped); and a "People to reach out to" column in My jobs: accessible people in the user's industry, especially Loughborough alumni (early-career, likely to reply), via LinkedIn search links the user opens. Build alongside Apply.

## Build stages (about 7 focused build days)
### Stage 0: Setup (day 1, morning)
- [x] Accounts: GitHub first; Vercel and Supabase via "Sign in with GitHub"; Anthropic Console (new separate individual organization for Grad Jobs, created from the existing login; own card, GBP 10 credit, monthly spend limit, API key); Reed (Adzuna account already created; free test calls only)
- [x] Create the repository and a blank Next.js app, deploy to Vercel
- Done when: a blank page is live at its free web address. (Live at https://gradjobsuk.vercel.app; Supabase project "grad-jobs" in eu-west-1.)
### Stage 1: Data engine (day 1)
- [x] Daily pull from Reed (graduate / entry-level / 2027); measure Adzuna overlap with its 25 free test calls (overlap test built; waiting on Adzuna keys in .env.local)
- [x] Duplicate removal
- [x] Free text-rule tagging of each listing
- [x] Sponsor register downloaded daily and matched
- [x] Google Jobs search as the daily cross-check (needs an account with a search-results API provider, e.g. DataForSEO)
- [x] Simple searchable list of roles with sponsor badges
- Done when: 1,000+ fresh UK grad roles appear each morning with sponsor badges. (Mihir's rule: main list = full-time roles starting June 2027+; ~210 today. Volume grows with Google Jobs depth after the DataForSEO top-up and employer feeds in Stage 4.)
### Stage 2: Profiles and matching (day 2)
- [x] Logins and private accounts (email + password)
- [x] Profile page exactly as specified above, CV upload and profile extraction (CV-to-profile suggestions still to do)
- [x] For You: free semantic ranking with matched tags
- [x] Role cards; Saved and Apply sections; applied history (company section comes with Stage 4 data)
- [x] Installable on phone home screen (PWA)
- Done when: Mihir opens it each morning and the For You list is genuinely relevant.
### Stage 3: CV tools, alerts, costs (days 3-4)
- [ ] Story bank, CV rewrites, keyword gaps, cover letter recommendations, company briefs with values, "sounds like AI" check, master CV templates (Opus)
- [ ] Email digest, Telegram alerts, deadline countdowns, closed-role warnings
- [ ] Exact cost tracking and spend cap
- [ ] Inbox sync
- [ ] Invite girlfriend and friends
- Done when: a second user signs up, uploads a CV and gets useful matches and alerts without help.
### Stage 4: Data depth (days 5-6)
- [ ] Master employer watch list, hiring-system feeds, career-page reading, coverage loop with daily coverage score
- [ ] Companies House data (optional, free key, only if company briefs need it); company summaries and news when a role is opened or saved
- [ ] Occupation codes and full visa salary check (on demand)
- [ ] Follow-a-company alerts
- Done when: major grad schemes appear within a day of opening, with company and visa detail, and the coverage score is visible.
### Stage 5: Polish (day 7)
- [ ] Dashboard stats, opening-soon flags, grad scheme calendar recording
- [ ] Speed, design and mobile polish
- [ ] Dark mode switch in Profile settings: Light / Dark / Match my phone (Mihir, 31 Oct 2026; later, not now)
### After launch
- [ ] Weekly check: errors, data freshness, costs, coverage score
- [ ] Update visa rules when GOV.UK changes them

## Rules
- AI is an editor, not a ghostwriter: never writes cover letters, never submits applications, never adds experience the user doesn't have.
- CVs and emails are private personal data (UK GDPR): own-data-only access, delete-my-account button, never shared.
- Respect every data source's terms; low-volume reads only; show required credits.
- Cost sharing between friends is strictly at cost.
