# Session Handoff: Enrichment UI — Tool-Result Architecture + Triage

**Created:** 2026-05-18 22:00
**Branch:** main
**Previous handoff:** docs/handoffs/2026-05-18-213000-enrichment-ui-v2.md

## Goal

Build a production-quality enrichment streaming UI with narrative text + structured data cards, and add intelligent triage to control agent effort per candidate.

## Current State

The enrichment UI is **fully functional** with a clean architecture. 14 commits this session, from the initial json-render integration through three architecture pivots to the final tool-result driven approach.

### Completed

- [x] **Tool-result driven cards** — model writes pure markdown, server auto-generates cards from gh_query JSON (ProfileHeader, MetricGrid, RepoCard)
- [x] **Custom SSE protocol** — events: text, tool-start, tool-end, card, sep, done
- [x] **Enhanced typography** — `.enrich-prose` CSS with styled bold, code, links, paragraphs
- [x] **Motion animations** — `motion/react` with `AnimatePresence initial={false}`, per-type transitions (text: fade+slide, cards: slide+scale, tools: horizontal slide, thinking: fade in/out)
- [x] **Smart auto-scroll** — only scrolls when near bottom, "↓ New content below" pill when scrolled up
- [x] **Thinking indicator** — pulsing dots during tool execution pauses (>2s)
- [x] **Tool indicators** — consecutive tools collapse into compact inline row
- [x] **RepoCard links** — card names link to GitHub repos
- [x] **Enrichment history** — "ENRICHMENT RUNS" section on detail page, expandable runs with tool log + narrative
- [x] **Data persistence** — gh_query results write to Candidate + Repo tables, narrative saved as EnrichmentLog
- [x] **Card deduplication** — ProfileHeader/MetricGrid/RepoCards emit only once per run
- [x] **Cache fix** — SHA-256 hash keys instead of truncated base64 (was causing cross-candidate collisions)
- [x] **Triage card** — deterministic signal scoring (Profile Depth, Repo Volume, Social Signal, Account Age) with SKIP/LIGHT/INVESTIGATE verdicts
- [x] **Plan-then-execute workflow** — agent states research plan after triage, respects verdict but can intelligently upgrade
- [x] **Ghost account short-circuit** — SKIP verdicts get 1-2 tools max

### Not Started

- [ ] Persist signals/skills/LinkedIn/web mentions from enrichment (only gh_query data persists currently)
- [ ] More card types from tool results (web_search → WebMentionCard, linkedin_lookup → LinkedInCard)
- [ ] Run `analyze` step to generate Profile/Signals/Skills from enrichment data
- [ ] Batch enrichment scheduling
- [ ] CSV export

## Key Decisions

1. **Tool-result cards > inline JSON > JSONL standalone** — Model should NEVER output UI specs. Cards come from actual tool data parsed server-side.
2. **Informational triage, not hard gate** — Agent sees scores and can intelligently override SKIP when it finds real signal (e.g., lucianschw-dev had custom fork branch).
3. **Motion over CSS @starting-style** — `@starting-style` re-triggered on every text block update. Motion with `AnimatePresence initial={false}` only animates NEW blocks.
4. **SHA-256 cache keys** — Truncated base64 caused cross-candidate collisions for similar endpoint paths.
5. **startTransition for text flushes** — React defers streaming text re-renders, keeps animations smooth.

## Failed Approaches

1. **json-render standalone JSONL** — No narrative, model skips ReasoningCards
2. **Inline mode (text + {"card":"..."} JSON)** — Model doesn't keep JSON on its own line, leaks into text
3. **CSS @starting-style animation** — Re-triggers on content updates, causes constant flickering
4. **textAccum/partial pattern** — Accumulated text rendered as plain `<span>`, raw `**bold**` showed literally
5. **Truncated base64 cache keys** — `/repos/X/foo` and `/repos/Y/foo` collided after 24-char truncation

## Critical File Locations

```
web/src/app/api/enrich/[login]/route.ts    — SSE streaming + card/triage generation + DB persistence
web/src/components/enrich-stream.tsx        — Client: SSE parser, motion animations, smart scroll
web/src/lib/enrich-components.tsx           — Card components (ProfileHeader, MetricGrid, RepoCard, TriageCard, etc.)
web/src/lib/tools/index.ts                 — System prompt with triage-aware workflow
web/src/lib/redis.ts                       — SHA-256 cache key hashing
web/src/app/globals.css                    — .enrich-prose, .enrich-cursor, .enrich-thinking CSS
web/src/components/enrichment-history.tsx   — Expandable enrichment run history
web/src/app/candidates/[login]/page.tsx    — Detail page with enrichment history section
web/src/lib/enrich-catalog.ts              — json-render catalog (installed, not actively used)
web/src/lib/enrich-registry.tsx            — json-render registry (installed, not actively used)
```

## Environment

- Docker: Postgres 54320, Redis 63790
- `mise.local.toml`: ANTHROPIC_API_KEY, BROWSERBASE_API_KEY, FIRECRAWL_API_KEY
- Dev server: port 3000
- Packages: `@json-render/core`, `@json-render/react`, `motion` installed
- ~894 candidates, ~6 enriched
- Redis gh cache flushed (30 stale entries cleared)

## Next Steps (prioritized)

1. **More tool-result cards** — Extend `cardsFromToolResult()` for web_search → WebMentionCards, linkedin_lookup → LinkedInCard
2. **Persist all findings** — Write signals, skills, LinkedIn, web mentions to DB during enrichment
3. **Run analyze step** — Generate Profile/Signals/Skills from enriched data via Claude
4. **Batch enrichment** — `mise run enrich -- --limit 20` to build up candidate database
5. **Animation polish** — The motion animations work but could use tuning based on real usage feedback
6. **Clean up unused json-render** — Catalog/registry files and packages could be removed if fully committed to tool-result architecture

## Commits This Session (14)

```
bfdc927 docs: research — motion animations for streaming UIs
31530f1 feat: server-side triage card + plan-then-execute workflow
3f9eea7 fix: cache key collisions + duplicate cards
a7da783 fix: agent short-circuits on ghost accounts after initial triage
4bb2cb7 feat: smart auto-scroll + animated scroll-to-bottom pill
47bc2a7 feat: motion animations — spring enter effects per block type
d4429c3 fix: RepoCard names are clickable links, remove janky animation
bede999 fix: collapse tool indicators inline + CSS enter animations
8d708fa fix: render streaming text as markdown, not plain spans
85932a6 feat: persist enrichment data + enrichment history on detail page
1281a65 docs: session handoff — enrichment UI v2, tool-result architecture
b2d4885 refactor: tool-result driven cards, pure markdown narrative
01a7e8e fix: parse card JSON even when model appends text on the same line
9be05eb fix: step boundary separators, thinking indicator, smooth streaming
d192913 feat: inline enrichment UI — narrative text + structured cards with streaming
```
