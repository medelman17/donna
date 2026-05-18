# Web Enrichment Extension — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Extend the Talent Scout pipeline with three-layer web enrichment: Stagehand (LinkedIn), Firecrawl (web search/scraping), and Claude server-side web tools (real-time ad-hoc lookups during analysis).

---

## Overview

The existing pipeline flow is: `fetch-forks → enrich → analyze`. This extension inserts a `web-enrich` step between `enrich` and `analyze`, and augments the `analyze` step with live web search tools.

**Updated flow:** `fetch-forks → enrich → web-enrich → analyze`

The three enrichment layers serve different purposes:

| Layer | Tool | Timing | Purpose |
|---|---|---|---|
| Stagehand (Browserbase) | AI browser automation | Batch (`web-enrich`) | LinkedIn full profile scrape — needs stealth browser |
| Firecrawl | Search + scrape API | Batch (`web-enrich`) | Google search results + page content extraction |
| Claude web_search/web_fetch | Server-side tools | Real-time (`analyze`) | Ad-hoc lookups Claude decides it needs during assessment |

---

## Dependencies

### New Python packages

| Package | Version | Purpose |
|---|---|---|
| `stagehand` | latest (3.19.5+) | AI browser automation via Browserbase |
| `firecrawl-py` | latest | Google search + web scraping |

### Environment variables

| Variable | Source | Status |
|---|---|---|
| `BROWSERBASE_API_KEY` | mise.local.toml | Already present |
| `BROWSERBASE_PROJECT_ID` | mise.local.toml | Already present |
| `ANTHROPIC_API_KEY` | mise.local.toml | Already present (used as `MODEL_API_KEY` for Stagehand) |
| `FIRECRAWL_API_KEY` | Firecrawl dashboard | **Needs to be added** to mise.local.toml |

---

## Data Model

Two new Prisma models added to `web/prisma/schema.prisma`:

### LinkedInProfile (1:1 with Candidate)

```prisma
model LinkedInProfile {
  id             Int       @id @default(autoincrement())
  candidateLogin String    @unique
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  profileUrl     String?
  headline       String?
  currentTitle   String?
  currentCompany String?
  location       String?
  connectionCount Int?
  experience     String?   // JSON array: [{title, company, duration, description}]
  education      String?   // JSON array: [{school, degree, field, years}]
  skills         String?   // JSON array of strings
  certifications String?   // JSON array: [{name, issuer}]
  scrapedAt      DateTime  @default(now())
}
```

### WebMention (many:1 with Candidate)

```prisma
model WebMention {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  url            String
  title          String?
  snippet        String?
  source         String    // "google", "github_mentions", "blog", "conference"
  content        String?   // Extracted markdown, capped ~5K chars
  scrapedAt      DateTime  @default(now())
}
```

The `Candidate` model gains two new relation fields:

```prisma
model Candidate {
  // ... existing fields ...
  linkedIn     LinkedInProfile?
  webMentions  WebMention[]
}
```

JSON fields (`experience`, `education`, `skills`, `certifications`) use stringified JSON because SQLite lacks native JSON arrays. These are read-only blobs — the pipeline writes them and Claude reads them during analysis.

---

## New Pipeline Modules

### `pipeline/src/scout/linkedin.py`

Stagehand-based LinkedIn profile discovery and extraction.

**Flow per candidate:**
1. Start a Stagehand session with `anthropic/claude-sonnet-4-6` as the model
2. Use `session.execute()` (agent mode) to Google search: `"{name}" "{company}" site:linkedin.com/in`
3. Agent navigates to the best LinkedIn result
4. Use `session.extract()` with a Pydantic `LinkedInProfileData` model to pull structured profile data
5. End session

**Pydantic model for extraction:**

```python
from pydantic import BaseModel

class Experience(BaseModel):
    title: str
    company: str
    duration: str | None = None
    description: str | None = None

class Education(BaseModel):
    school: str
    degree: str | None = None
    field: str | None = None
    years: str | None = None

class LinkedInProfileData(BaseModel):
    profile_url: str | None = None
    headline: str | None = None
    current_title: str | None = None
    current_company: str | None = None
    location: str | None = None
    experience: list[Experience] = []
    education: list[Education] = []
    skills: list[str] = []
    certifications: list[str] = []
```

**Rate limiting:** 1 session at a time, 5-second delay between candidates. Stagehand sessions use Browserbase's stealth browser infrastructure.

**Error handling:** If LinkedIn profile not found or scrape fails, log the error and continue. Store `None` for that candidate's `LinkedInProfile`.

### `pipeline/src/scout/web_search.py`

Firecrawl-based Google search and page content extraction.

**Flow per candidate:**
1. Search Google via Firecrawl: `"{name}" {github_login} developer` → top 10 results
2. For each result URL, scrape page content via Firecrawl → clean markdown
3. Cap content at 5K chars per page
4. Store as `WebMention` rows

**Concurrency:** `asyncio.Semaphore(5)` for parallel scraping. Tenacity retry on 429/5xx.

**Filtering:** Skip results from github.com (we already have that data), skip results with no meaningful content (<100 chars).

### `pipeline/src/scout/web_enrich.py`

Orchestrator that runs both LinkedIn and web search per candidate.

**Flow:**
1. Get list of candidates who have been GitHub-enriched but not web-enriched
2. For each candidate:
   a. Run LinkedIn lookup (Stagehand)
   b. Run web search (Firecrawl)
   c. Persist results
3. Progress bar via Rich

**"Un-web-enriched" detection:** Candidates who have Repo rows but no LinkedInProfile or WebMention rows.

---

## Modified Modules

### `prompts.py` — Extended user message

The `build_user_message()` function gains two new sections:

```
## LinkedIn Profile
- Headline: Senior Software Engineer at Acme Corp
- Current Role: Senior Software Engineer at Acme Corp (2022-present)
- Previous: Software Engineer at StartupX (2019-2022)
- Education: BS Computer Science, MIT
- Skills: Python, TypeScript, Machine Learning, ...

## Web Presence (5 mentions found)
- [Blog Post] "Building AI Legal Tools" (example.com/blog/ai-legal)
  > Excerpt of the blog post content...
- [Conference] Speaker at LegalTech 2025 (legaltech.com/speakers)
  > Bio and talk description...
- [Personal Site] janedoe.dev
  > About page content...
```

### `analyze.py` — Server-side web tools

The Claude analysis call gains server-side `web_search` and `web_fetch` tools so Claude can do ad-hoc lookups during its assessment:

```python
response = client.messages.create(
    model=MODEL,
    max_tokens=8192,
    system=[{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"},
    }],
    tools=[
        {**TOOL_SCHEMA, "cache_control": {"type": "ephemeral"}},
        {"type": "web_search_20260209", "name": "web_search"},
        {"type": "web_fetch_20260209", "name": "web_fetch"},
    ],
    tool_choice={"type": "tool", "name": "record_profile"},
    messages=[{"role": "user", "content": user_message}],
)
```

**Important:** `tool_choice` still forces Claude to eventually call `record_profile`, but Claude can make intermediate `web_search`/`web_fetch` calls first. The response handling must loop on `stop_reason == "tool_use"` (for web tool results) until Claude calls `record_profile`.

Wait — `tool_choice: {"type": "tool", "name": "record_profile"}` forces Claude to call *only* `record_profile`. To allow Claude to use web tools first, we need `tool_choice: {"type": "any"}` and handle the loop, OR use `tool_choice: {"type": "auto"}` and check for `record_profile` in the response.

**Revised approach:** Use `tool_choice: {"type": "auto"}` and implement an agentic loop:
1. Send the message
2. If `stop_reason == "pause_turn"`, the server-side tools (`web_search`, `web_fetch`) are still running — re-send the user message + assistant response to continue (no extra user message needed, per Anthropic docs)
3. If `stop_reason == "tool_use"` and the block is `record_profile` (our custom tool), extract the structured data and persist — done
4. If `stop_reason == "end_turn"`, Claude finished without calling `record_profile` — parse text for any useful info or log a warning
5. Cap at `max_continuations=5` to prevent infinite loops

Key detail: `web_search` and `web_fetch` are **server-side tools** — Anthropic executes them and returns results as `server_tool_use` + `web_search_tool_result`/`web_fetch_tool_result` content blocks in the response. The client doesn't execute anything. The `pause_turn` stop reason signals the server-side loop hit its iteration limit; re-sending continues it.

`record_profile` remains a **client-side tool** — when Claude calls it, `stop_reason == "tool_use"` and we extract `block.input` from the `tool_use` content block.

### `cli.py` — New command

```python
@app.command()
def web_enrich(limit: Optional[int] = typer.Option(None, help="Max candidates")):
    """Enrich candidates with LinkedIn and web presence data."""
    count = pipeline.run_web_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates web-enriched.")
```

### `pipeline.py` — Updated orchestrator

```python
def run_full_pipeline() -> None:
    run_fetch_forks()
    run_enrich()
    run_web_enrich()  # NEW
    run_analyze()
```

### `db.py` — New helpers

- `upsert_linkedin_profile(conn, login, data)` — Insert/update LinkedInProfile row
- `insert_web_mentions(conn, login, mentions)` — Delete + re-insert WebMention rows
- `get_unweb_enriched_logins(conn, limit)` — Candidates with Repo rows but no LinkedInProfile
- `get_candidate_bundle()` — Extended to include `linkedin` and `web_mentions` data

---

## System Prompt Update

The system prompt in `prompts.py` gains a paragraph about web data:

> You may also receive LinkedIn profile data and web mentions (blog posts, conference talks, personal sites). Use this to build a more complete picture:
> - LinkedIn experience and skills complement GitHub activity
> - Blog posts and talks indicate thought leadership
> - Conference appearances suggest community involvement
> - Gaps between LinkedIn and GitHub (e.g., claims senior role but sparse GitHub) are worth noting
>
> You also have access to `web_search` and `web_fetch` tools. If the provided data leaves gaps that a quick search could fill, use them — but don't search for every candidate. Use them when something seems promising but incomplete.

---

## Cost & Throughput Estimates

### Stagehand (LinkedIn)
- ~899 candidates × ~1 Browserbase session each
- ~30-60 seconds per session (agent navigates Google → LinkedIn → extract)
- Stagehand uses Claude Sonnet 4.6 for AI decisions (~$3/$15 per 1M tokens)
- Estimated: ~$10-20 in Stagehand LLM costs + Browserbase session time
- Wall-clock: ~15-20 hours at 1 session/candidate (sequential with delays)
- Run with `--limit` for initial validation

### Firecrawl
- ~899 searches + ~4,500 page scrapes (5 per candidate)
- Free tier: 500 credits/month (1 credit per scrape)
- May need paid plan ($19/mo for 3K credits) or batch over multiple months
- Wall-clock: ~2-3 hours with concurrency=5

### Claude web tools during analyze
- Server-side, billed as additional input/output tokens
- Estimates ~10-20% of candidates will trigger a web search (Claude decides)
- Additional ~$5-10 on top of the base analysis cost

---

## CLI Summary

Updated command set:

| Command | Description |
|---|---|
| `uv run scout fetch-forks` | Paginate forkers into Candidate rows |
| `uv run scout enrich [--limit N]` | GitHub profile, repos, events |
| `uv run scout web-enrich [--limit N]` | **NEW** — LinkedIn + web presence |
| `uv run scout analyze [--limit N]` | Claude analysis (now with web tools) |
| `uv run scout run` | Full pipeline (now includes web-enrich) |
| `uv run scout deep-dive <login>` | Agent SDK deep-dive |
| `uv run scout stats` | Print counts |

---

## Files Changed/Created

| Path | Action | Purpose |
|---|---|---|
| `pipeline/pyproject.toml` | Modify | Add `stagehand`, `firecrawl-py` deps |
| `pipeline/src/scout/linkedin.py` | Create | Stagehand LinkedIn scraping |
| `pipeline/src/scout/web_search.py` | Create | Firecrawl search + scraping |
| `pipeline/src/scout/web_enrich.py` | Create | Web enrichment orchestrator |
| `pipeline/src/scout/db.py` | Modify | Add LinkedIn/WebMention upsert helpers |
| `pipeline/src/scout/prompts.py` | Modify | Add LinkedIn/web data to user message; update system prompt |
| `pipeline/src/scout/analyze.py` | Modify | Add web_search/web_fetch tools; implement agentic loop for server tools |
| `pipeline/src/scout/pipeline.py` | Modify | Add `run_web_enrich()` to orchestrator |
| `pipeline/src/scout/cli.py` | Modify | Add `web-enrich` command |
| `web/prisma/schema.prisma` | Modify | Add LinkedInProfile, WebMention models + Candidate relations |
