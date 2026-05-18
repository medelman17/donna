# Session Handoff: Donna — Full Enrichment Pipeline + Settings + Mobile

**Created:** 2026-05-18 30:00 (session 4)
**Branch:** main
**Previous handoffs:**
- `docs/handoffs/2026-05-18-220000-enrichment-ui-final.md` — tool-result cards + triage
- `docs/handoffs/2026-05-18-213000-enrichment-ui-v2.md` — enrichment UI v2
- `docs/handoffs/2026-05-18-183000-talent-scout-v1.md` — initial scaffolding

## Goal

Build **Donna** — an AI-powered legal tech talent intelligence platform that researches GitHub users (fork authors, issue/PR authors, contributors, stargazers) of `willchen96/mike`, an open-source legal AI platform. "She knows everything about everyone."

## Current State

The platform is **fully functional end-to-end**: seed candidates from GitHub, run background enrichment with 12 tools, stream results via SSE, analyze with structured extraction, display on a responsive UI with settings-driven scoring. 40+ commits this session.

## Commit History (HEAD~40..HEAD)

```
01606b5 feat: raise step limits — 50 for enrichment, 15 for subagents
8f911b4 fix: fall back to claude-opus-4-6 — Opus 4-7 is overloaded (529)
988537f feat: upgrade analysis step to claude-opus-4-7
f02bd8b fix: style blockquotes in enrichment prose
9572208 fix: bump mobile bottom padding to 80px
1d0b811 fix: add bottom padding on mobile so content clears the bottom sheet
c1ee84d fix: use Tailwind responsive classes instead of CSS overrides
e9131ea fix: metastrip class name typo — was meta-strip, actually metastrip
6283d9f fix: prevent all horizontal overflow on mobile
e51242d fix: mobile list — force fit chip + summary visible, fix search overflow
e3131c6 fix: mobile list rows — switch from grid to flexbox
07c0bab fix: mobile list spacing — larger text, proper row separation
a88a855 fix: mobile list — hide filters and meta strip, show only search + sort
1dd5aca fix: circular avatars — border-radius 50% instead of 5px
829e0da fix: mobile avatar — resize via CSS var, not img override
8bcc04b fix: mobile list view — clean 2-row card layout per candidate
a594b07 fix: mobile detail header — inline avatar + name, compact meta
f1619d2 fix: Donna logo links to home on all views
2f36d04 fix: cleaner mobile sheet header — minimal pill + dismiss
8b9a6e9 fix: sticky close button in mobile sheet, show Donna on mobile
e66f123 fix: hide breadcrumb + stats on mobile, keep Settings visible
6c1a637 feat: mobile bottom sheet for sidebar panel
ab178ae feat: responsive mobile layout
33a5815 fix: signal card text overflow — add min-width:0 + word-break
ce1a774 fix: remove tagline, clean topbar — just Donna
e1df887 fix: tagline — "Legal tech talent discovery for well-suited candidates"
1ed9f81 feat: seed from issues, PRs, contributors, and stargazers
6ee26ef fix: topbar tagline — "Legal tech talent intelligence"
b4cf167 feat: auto-promote status from "new" to "enriched" after analysis
1d45e4e rebrand: Talent Scout -> Donna
2fbb292 feat: multi-select rows + batch enrich from list view
3e5f829 fix: move Level column next to Languages, scrollable lang pills
0b0e3d2 fix: seniority as own column, tighten grid to prevent overflow
170a054 fix: fetch all candidates so analyzed ones aren't excluded
0db7f18 fix: sort analyzed candidates to top of list view
e00a6bb feat: candidate source links in sidebar Details tab
9399c08 fix: keyboard shortcuts as bottom rail in sidebar
6354e05 fix: center tab underline indicator
6358653 fix: clean breadcrumb, add labels to status/tags in sidebar
94d8870 fix: enrich button inline in header name row
```

## Uncommitted Changes

Only non-functional files:
- `.playwright-mcp/console-*.log` — MCP log (modified)
- `docs/research/2026-05-18-streaming-generative-ui-tool-results.md` — research doc (untracked)
- `web/tsconfig.tsbuildinfo` — TS build cache (untracked)

No uncommitted code changes.

---

## Architecture

### High-Level Data Flow

```
GitHub API (gh cli)
       |
  POST /api/seed ──> Candidate rows in Postgres
       |
  POST /api/enrich/[login] ──> BullMQ job queued in Redis
       |
  BullMQ Worker (enrich-worker.ts)
       |  streamText() with 12 tools
       |  Publishes events to Redis Pub/Sub channel: scout:enrich:{login}
       |
  GET /api/enrich/[login]/stream ──> SSE endpoint subscribes to Redis Pub/Sub
       |
  Client (enrich-stream.tsx) ──> Renders markdown + cards in real time
       |
  Post-enrichment: generateObject() with Zod schema
       |  Extracts fitScore, seniority, signals, skills, LinkedIn, web mentions
       |  8 top-line categories (openToWork, isLawyer, hasOwnCompany, etc.)
       |
  Prisma interactive $transaction ──> Profile, Signal, Skill, LinkedInProfile, WebMention
       |
  Auto-promote CRM status: "new" -> "enriched"
```

### Key File Map

#### Enrichment Pipeline (server-side)

| File | Purpose |
|------|---------|
| `web/src/lib/queue.ts` | BullMQ queue + worker setup via `globalThis` singleton. Concurrency: 2. Redis key `scout:job:{login}` tracks active jobs (TTL 600s). |
| `web/src/lib/enrich-worker.ts` | Main enrichment logic. `runEnrichment()` calls `streamText()` with 12 tools, publishes SSE events via Redis Pub/Sub. `runAnalysis()` calls `generateObject()` with Zod schema, persists via interactive `$transaction`. |
| `web/src/lib/tools/index.ts` | Tool registry (12 tools) + `ENRICHMENT_SYSTEM_PROMPT` with triage workflow (SKIP/LIGHT/INVESTIGATE). |
| `web/src/lib/tools/company-context.ts` | Reads Settings/JobPosition/HiringPreference from DB. Agent calls this FIRST. |
| `web/src/lib/tools/gh-query.ts` | GitHub REST API via `gh` CLI subprocess. |
| `web/src/lib/tools/web-search.ts` | Google search via Firecrawl API. |
| `web/src/lib/tools/web-scrape.ts` | Page content extraction via Firecrawl. |
| `web/src/lib/tools/linkedin-lookup.ts` | LinkedIn profile scraping via Browserbase + Stagehand. |
| `web/src/lib/tools/twitter-lookup.ts` | Twitter/X profile scraping via Browserbase + Stagehand. |
| `web/src/lib/tools/technical-assess.ts` | Subagent: reads source code, assesses engineering ability. |
| `web/src/lib/tools/legal-assess.ts` | Subagent: investigates legal/legal-tech connections. |
| `web/src/lib/tools/github-contributions.ts` | PRs merged / issues filed on OTHER repos. |
| `web/src/lib/tools/package-registry.ts` | npm/PyPI published packages. |
| `web/src/lib/tools/devto-posts.ts` | dev.to / Hashnode blog posts. |
| `web/src/lib/tools/stackoverflow-lookup.ts` | Stack Overflow reputation + top tags. |

#### API Routes

| File | Purpose |
|------|---------|
| `web/src/app/api/enrich/[login]/route.ts` | `POST` queues BullMQ job (deduped via Redis key). `GET` returns enrichment status + recent logs. |
| `web/src/app/api/enrich/[login]/stream/route.ts` | SSE endpoint. Creates Redis subscriber on `scout:enrich:{login}`, pipes messages as `data:` frames. |
| `web/src/app/api/seed/route.ts` | `POST` fetches forks, issues, PRs, contributors, stargazers from `willchen96/mike` via `gh api --paginate`. Dedupes by login. |
| `web/src/app/api/settings/route.ts` | `GET`/`PUT` for key-value settings (company_description). |
| `web/src/app/api/settings/positions/route.ts` | Full CRUD for `JobPosition` table. |
| `web/src/app/api/settings/preferences/route.ts` | Full CRUD for `HiringPreference` table (tag + description + weight 1-3). |

#### UI Components

| File | Purpose |
|------|---------|
| `web/src/components/enrich-stream.tsx` | Real-time enrichment viewer. Renders markdown text + structured cards (ProfileHeader, MetricGrid, TriageCard, RepoCard). Motion animations, auto-scroll, thinking indicator. |
| `web/src/components/detail-with-enrich.tsx` | Wrapper: auto-resumes enrichment stream on mount if job is active. Provides `useEnrich()` context for triggering enrichment. |
| `web/src/components/candidate-list.tsx` | List view with multi-select + batch enrich, seniority column, bookmark filter, search, sort (analyzed first). |
| `web/src/components/assessment-card.tsx` | Category pills (color-coded), hides negative booleans. |
| `web/src/components/signal-list.tsx` | Displays positive/negative/notable signals from analysis. |
| `web/src/app/settings/page.tsx` | Settings UI: company description (auto-save textarea), position cards (CRUD), preference rows with weight dots (CRUD). |

#### Python Pipeline (legacy/alternative)

| File | Purpose |
|------|---------|
| `pipeline/src/scout/pipeline.py` | `run_fetch_forks()`, `run_fetch_contributors()`, `run_enrich()`, `run_analyze()`, `run_full_pipeline()`. |
| `pipeline/src/scout/github.py` | `gh_api()` wrapper with caching. `fetch_forks()`, `fetch_issues()`, `fetch_pulls()`, `fetch_contributors()`, `fetch_stargazers()`, `fetch_compare()`. |

#### Database Schema

| File | Purpose |
|------|---------|
| `web/prisma/schema.prisma` | Full schema: Candidate, ForkMeta, Repo, Event, Profile (8 top-line category fields), Signal, Skill, Crm (bookmarked field), LinkedInProfile (recentActivity), WebMention, EnrichmentLog, Setting, JobPosition, HiringPreference, AgentMemory. |

### Database Schema Details

**Candidate** (`login` PK): name, email, bio, location, company, blog, twitter, hireable, followers, publicRepos, avatarUrl, htmlUrl, githubCreatedAt

**Profile** (1:1 with Candidate): summary, fitScore (1-5), fitReasoning, seniority (junior/mid/senior/staff/unknown), recommendedOutreach (yes/no/maybe), outreachReason, confidence (0-1), openToWork, isLawyer, hasOwnCompany, companyName, aiExperience, legalTechRelevance, communityActivity, influenceLevel, model, rawJson

**Signal** (many per Candidate): kind (positive/negative/notable), text

**Skill** (many per Candidate): name

**Crm** (1:1): status (new/enriched/...), bookmarked, notes, tags

**LinkedInProfile** (1:1): profileUrl, headline, currentTitle, currentCompany, location, connectionCount, experience, education, skills, certifications, recentActivity

**WebMention** (many): url, title, snippet, source (blog/company/conference/social/portfolio/news/other)

**Setting**: key-value pairs (e.g., `company_description`)

**JobPosition**: title, description

**HiringPreference**: tag, description, weight (1-3)

### SSE Protocol

Events published to Redis channel `scout:enrich:{login}`:

| Event | Payload | Purpose |
|-------|---------|---------|
| `text` | `{ text: string }` | Streaming markdown text delta |
| `tool-start` | `{ tool: string, args: string }` | Tool invocation started |
| `tool-end` | `{ tool: string }` | Tool finished |
| `card` | `{ card: string, props: object }` | Structured data card (ProfileHeader, MetricGrid, TriageCard, RepoCard) |
| `sep` | `{}` | Step separator |
| `done` | `{}` | Enrichment complete |

### Analysis Schema (Zod)

The `generateObject()` call extracts:
- `summary` (string), `fitScore` (1-5), `fitReasoning` (string)
- `seniority` (junior/mid/senior/staff/unknown)
- `recommendedOutreach` (yes/no/maybe), `outreachReason`
- `confidence` (0-1)
- `signals[]` (kind + text), `skills[]` (string)
- `openToWork`, `isLawyer`, `hasOwnCompany`, `companyName`
- `aiExperience` (none/basic/intermediate/advanced/unknown)
- `legalTechRelevance` (deep/adjacent/transferable/none/unknown)
- `communityActivity` (none/low/moderate/high/unknown)
- `influenceLevel` (none/emerging/established/notable/unknown)
- `linkedin` (nullable object with 11 fields)
- `webMentions[]` (url, title, snippet, source)

### Triage System

Server-side deterministic scoring in `cardsFromToolResult()`:
- **Profile Depth** (0-5): name, bio, blog, twitter, company
- **Repo Volume** (0-5): `floor(publicRepos / 3)`, capped at 5
- **Social Signal** (0-5): followers thresholds (2/10/50/200/1000)
- **Account Age** (0-5): years since account creation

Verdicts:
- **SKIP** (< 4 total): ghost/empty account, agent stops after 1-2 sentences
- **LIGHT** (4-7): 3-4 more tool calls max
- **INVESTIGATE** (8+): full research with all relevant tools

---

## Environment

| Resource | Config |
|----------|--------|
| PostgreSQL | `localhost:54320` (Docker) |
| Redis | `localhost:63790` (Docker) |
| Dev server | `localhost:3000` (Next.js) |
| API keys | `mise.local.toml`: ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, FIRECRAWL_API_KEY |
| Model | `claude-opus-4-6` (fell back from `claude-opus-4-7` due to 529 Overloaded) |
| Step limits | 50 for enrichment agent, 15 for subagents |

### Dependencies of Note

- `bullmq` — job queue (Redis-backed)
- `ioredis` — Redis client for Pub/Sub SSE
- `@ai-sdk/anthropic` + `ai` — Vercel AI SDK for streamText/generateObject
- `@browserbasehq/stagehand` — headless browser for LinkedIn/Twitter scraping
- `motion` — animation library (motion/react)
- `zod` — schema validation for structured extraction
- `prisma` — ORM with generated client at `../generated/prisma`

---

## Key Design Decisions

1. **BullMQ over fire-and-forget** — proper job queue with Redis. Worker runs in Next.js process via `globalThis` singleton (survives HMR). Concurrency 2. Jobs tracked via Redis key with 600s TTL. Navigate away and come back, enrichment continues.

2. **Structured settings over free text** — `JobPosition` and `HiringPreference` tables with full CRUD. Settings injected into both the enrichment agent system prompt (via `company_context` tool) and the analysis scoring prompt. Weight system (1-3) allows prioritization.

3. **Analysis via generateObject + Zod** — type-safe structured extraction using Vercel AI SDK. Not free-form JSON parsing. Schema has 8 top-line category enums for consistent filtering/display.

4. **Tool-result driven cards** — model writes pure markdown narrative, server auto-generates structured UI cards from tool result JSON. ProfileHeader, MetricGrid, TriageCard, RepoCard are created by parsing `gh_query` output in `cardsFromToolResult()`.

5. **Informational triage not hard gate** — agent sees triage scores and verdict via TriageCard, can intelligently override (e.g., upgrade a LIGHT to INVESTIGATE if the profile shows unexpected depth). System prompt guides but does not enforce.

6. **Interactive transaction for analysis persistence** — Prisma `$transaction(async (tx) => ...)` instead of batch `$transaction([...])`. The batch approach had TypeScript errors with mixed-model operations.

7. **Redis Pub/Sub for SSE** — worker publishes to `scout:enrich:{login}` channel, SSE endpoint creates a fresh Redis subscriber per connection. Clean separation between job execution and event delivery.

---

## Failed Approaches and Gotchas

1. **Opus 4-7 returns 529 Overloaded** — had to fall back to `claude-opus-4-6` for both enrichment and analysis. Commit `8f911b4`.

2. **CSS specificity wars on mobile** — started with CSS media queries, but cascading overrides fought with component inline styles. Eventually switched entirely to Tailwind responsive classes (`max-sm:hidden`, etc.). Commit `c1ee84d`.

3. **Prisma batch transaction type errors** — `prisma.$transaction([op1, op2])` fails TypeScript checks when operations target different models (Profile upsert + Signal deleteMany + Skill create). Switched to interactive `$transaction(async (tx) => ...)`.

4. **Meta strip class name typo** — CSS targeted `.meta-strip` but the HTML had class `metastrip`. Styles never applied. Commit `e9131ea`.

5. **PostgreSQL NULL ordering with DESC** — `ORDER BY fitScore DESC` puts `NULL` (unanalyzed) candidates first. Had to sort in JavaScript after fetch to put analyzed candidates at top. Commit `0db7f18`.

6. **Stale Prisma client after schema changes** — after adding new fields to `schema.prisma`, the generated client is stale until `prisma generate` runs and the dev server restarts. TypeScript errors on new fields until restart.

7. **Grid auto-placement broken by hidden children on mobile** — CSS Grid with `auto-fill` left gaps when children were `display:none` on mobile. Switched to flexbox which handles hidden children cleanly. Commit `e3131c6`.

8. **Thinking indicator jitter** — the "thinking..." dots would flicker when tool calls completed quickly. Fixed by adding a minimum display time before removing.

---

## What Was Built (Feature Summary)

### Core Enrichment Pipeline
- BullMQ background enrichment jobs — server-side, survive page navigation
- 12 enrichment tools (context, GitHub, web, LinkedIn, Twitter, subagents, community)
- Post-enrichment analysis step with `generateObject()` + Zod schema
- 8 top-line category extractions (openToWork, isLawyer, hasOwnCompany, aiExperience, legalTechRelevance, communityActivity, influenceLevel)
- Auto-promote CRM status "new" to "enriched" after analysis

### Settings System
- Company description (free text, auto-save)
- Structured job positions (CRUD cards with title + description)
- Weighted hiring preference tags (tag + description + weight 1-3, visual dots)
- Settings injected into enrichment agent prompt (via `company_context` tool) and analysis scoring prompt

### Data Seeding
- `POST /api/seed` — fetches forks, issues, PRs, contributors, stargazers from `willchen96/mike`
- Python pipeline `run_fetch_contributors()` — same sources, uses `gh api --paginate`
- Both dedupe by login

### UI
- Candidate summary banner on detail page
- AssessmentCard with color-coded category pills (hides negative booleans)
- Animated tab sidebar (Details | Notes) with sliding indicator
- Source links section (GitHub, email, LinkedIn, Twitter, blog)
- Triage scoring in sidebar
- Bookmark button + Saved filter on list
- Multi-select rows + batch enrich from list view
- Seniority column in list
- Redesigned repo cards (streaming + detail views)
- Mobile responsive layout with bottom sheet sidebar
- Heading styles + blockquote styles in enrichment prose
- Thinking indicator jitter fix

### Branding
- Renamed from "Talent Scout" to "Donna" — "She knows everything about everyone"

---

## Immediate Next Task

**Implementing automatic data seeding.** The `POST /api/seed` endpoint exists and works, but it must be manually triggered. The next step is wiring it into the startup flow so candidates are automatically loaded on first use. Options:

1. **On-demand trigger** — add a "Seed" button in the UI (simplest)
2. **First-boot check** — if `Candidate.count() === 0`, auto-run seed on first page load
3. **Startup script** — run seed as part of `npm run dev` or Docker compose
4. **Cron/scheduled** — periodically re-seed to pick up new forks/stargazers

The user wants option 2 or similar — it should "just work automatically" without manual intervention.

---

## Files to Read When Resuming

Start with these to get up to speed:

1. `web/src/lib/enrich-worker.ts` — the core enrichment + analysis logic
2. `web/src/lib/queue.ts` — BullMQ setup
3. `web/src/lib/tools/index.ts` — tool registry + system prompt
4. `web/src/app/api/seed/route.ts` — seeding endpoint (next task touches this)
5. `web/prisma/schema.prisma` — full data model
6. `web/src/components/enrich-stream.tsx` — streaming UI
7. `web/src/app/settings/page.tsx` — settings UI
8. `web/src/components/candidate-list.tsx` — list with multi-select + batch enrich

---

## Running the Project

```bash
# Start infrastructure
docker compose up -d   # Postgres 54320, Redis 63790

# Install + generate
cd web && npm install && npx prisma generate && npx prisma db push

# Dev server
npm run dev   # localhost:3000

# Seed candidates (manual for now)
curl -X POST http://localhost:3000/api/seed

# Python pipeline (alternative)
cd pipeline && uv run scout fetch-forks && uv run scout fetch-contributors
```
