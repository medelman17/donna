# Agent-Driven Enrichment — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Replace the separate `enrich` + `web-enrich` pipeline steps with a single Claude Agent SDK session per candidate that pulls GitHub data, searches the web, scrapes pages, and looks up LinkedIn — all driven by Claude's reasoning about what to search for and why.

---

## Overview

The current pipeline has three enrichment steps that run in sequence:

1. `enrich` — dumb GitHub API calls (profile, repos, events, fork compare)
2. `web-enrich` — naive Firecrawl search with `"{name}" {login} developer` (returns nothing for most candidates) + Stagehand LinkedIn lookup
3. `analyze` — Claude Opus 4.7 assessment

The problem: step 2 constructs search queries without understanding the candidate. A bio that says "Senior AI & LLM Engineer | RAG Pipelines" is a goldmine of search context, but the code ignores it and searches for `"Nader Bennour" 0xNadr developer` — which returns zero results.

**Solution:** Replace steps 1 and 2 with a single **Claude Agent SDK session** per candidate. The agent receives the GitHub login and the fork context, then autonomously:

1. Pulls the candidate's GitHub profile, repos, activity via `gh_query`
2. Reads what it finds — bio, company, blog URL, Twitter, repo descriptions, languages
3. Constructs intelligent search queries based on what it learned
4. Searches the web via Firecrawl
5. Scrapes promising pages for content
6. Looks up LinkedIn via Stagehand (if it has enough context — name + company/title)
7. Returns structured findings

**Updated pipeline:** `fetch-forks → enrich → analyze`

Where `enrich` is now the agent-driven step. `web-enrich` is removed. `deep-dive` becomes an alias for re-enriching a single candidate.

---

## Agent Design

### Tools

| Tool | Backend | Signature | Purpose |
|---|---|---|---|
| `gh_query` | `gh` CLI subprocess | `(endpoint: str, jq_filter?: str)` | Pull any GitHub REST API data |
| `web_search` | Firecrawl `search()` | `(query: str, limit?: int)` | Search Google, returns titles + URLs + snippets |
| `web_scrape` | Firecrawl `scrape()` | `(url: str)` | Extract markdown from a URL (blog, personal site, etc.) |
| `linkedin_lookup` | Stagehand/Browserbase | `(name: str, company?: str, title?: str)` | Google → LinkedIn → extract structured profile |

All four tools are registered as MCP tools via `create_sdk_mcp_server()` and exposed to the agent through `ClaudeAgentOptions.mcp_servers`.

### System prompt

```
You are a talent research agent. Your job is to build a comprehensive profile of a software developer who forked an open-source AI legal platform (willchen96/mike on GitHub).

You have four tools:
- gh_query: Pull data from the GitHub API (profile, repos, events, READMEs)
- web_search: Search Google for the person
- web_scrape: Extract content from a specific URL
- linkedin_lookup: Find and extract their LinkedIn profile

WORKFLOW:
1. Start by pulling their GitHub profile: gh_query endpoint="/users/{login}"
2. Pull their top repos: gh_query endpoint="/users/{login}/repos?sort=stars&per_page=10"
3. Pull recent activity: gh_query endpoint="/users/{login}/events/public?per_page=30"
4. Read what you found carefully. Note their:
   - Real name, bio, company, location
   - Blog URL or personal site (scrape it directly if present)
   - Twitter handle
   - Top languages and notable repos
   - Any clues about their professional identity

5. Based on what you learned, search the web intelligently:
   - If they have a personal blog/site → web_scrape it
   - If their bio mentions a job title → search LinkedIn for "{name}" "{title}" "{company}"
   - Search for conference talks: "{name}" (speaker OR talk OR conference) {primary_language}
   - Search for blog posts: "{name}" (blog OR article OR wrote) {domain_expertise}
   - If they have notable repos → search for mentions of those projects

6. For promising search results, scrape the actual pages to get content

7. If you have a name + company or title, try linkedin_lookup

BE SMART:
- Don't search for people with no name and no bio — there's nothing to find
- If their GitHub is mostly forks with no own work, note that and move on
- Blog URLs in the GitHub profile are the highest-value signal — always scrape those
- A bio like "Senior AI Engineer at Google" gives you everything you need for LinkedIn
- Don't make redundant searches — if you already found their LinkedIn, don't search again
- Quality over quantity — 3 good findings beat 10 empty results
```

### Agent options

```python
ClaudeAgentOptions(
    system_prompt=ENRICHMENT_SYSTEM_PROMPT,
    mcp_servers={"tools": enrichment_server},
    allowed_tools=[
        "mcp__tools__gh_query",
        "mcp__tools__web_search",
        "mcp__tools__web_scrape",
        "mcp__tools__linkedin_lookup",
    ],
    max_turns=30,
)
```

### Agent prompt (per candidate)

```
Research the GitHub developer "{login}" who forked the repository willchen96/mike (an open-source AI legal platform built with TypeScript/Python).

Start by pulling their GitHub data, then use what you find to search the web for their professional presence. Report everything you find.
```

---

## Provenance Logging

Every tool call's raw input and output is persisted for auditability.

### New Prisma model: `EnrichmentLog`

```prisma
model EnrichmentLog {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  tool           String    // "gh_query" | "web_search" | "web_scrape" | "linkedin_lookup"
  input          String    // JSON — the tool call arguments
  output         String    // JSON — the raw tool response (truncated to 10KB)
  durationMs     Int?      // how long the tool call took
  createdAt      DateTime  @default(now())
}
```

The `Candidate` model gains a new relation:

```prisma
model Candidate {
  // ... existing fields ...
  enrichmentLogs  EnrichmentLog[]
}
```

Each tool wrapper logs before returning:

```python
@tool("web_search", ...)
async def web_search(args):
    start = time.time()
    result = firecrawl_app.search(args["query"], limit=args.get("limit", 5))
    duration = int((time.time() - start) * 1000)
    # Log to DB
    log_tool_call(login, "web_search", args, result, duration)
    # Return to agent
    return {"content": [{"type": "text", "text": format_results(result)}]}
```

This means you can later query: "What did the agent search for candidate X? What did it find? How long did each step take?"

---

## Data Persistence

The agent's tool calls populate the same tables as before:

| Tool call | Populates |
|---|---|
| `gh_query /users/{login}` | `Candidate` (upsert — name, bio, company, etc.) |
| `gh_query /users/{login}/repos` | `Repo` rows (delete + re-insert) |
| `gh_query /users/{login}/events` | `Event` rows (delete + re-insert) |
| `gh_query /repos/.../compare` | `ForkMeta` (upsert) |
| `web_search` | No direct persistence — agent reads results and decides what to scrape |
| `web_scrape` | `WebMention` rows (URL, title, content, source classification) |
| `linkedin_lookup` | `LinkedInProfile` (upsert) |

**When to persist:** Each tool wrapper persists data to the DB as a side effect, not the agent. The agent just sees text results. This means even if the agent session crashes mid-way, any completed tool calls have already saved their data.

**The agent's final text result** is stored in `Profile.rawJson` (or a new `enrichmentSummary` field) as a human-readable narrative of what it found — useful for debugging and for Claude during the analysis step.

---

## Tool Implementations

### `gh_query` (reuse existing)

Same as `deep_dive.py` — runs `gh api {endpoint}` subprocess with optional `--jq` filter. Already implemented.

### `web_search`

```python
@tool("web_search", "Search Google for a person or topic", {...})
async def web_search(args):
    app = FirecrawlApp(api_key=get_firecrawl_key())
    results = app.search(args["query"], limit=args.get("limit", 8))
    # Format as readable text for the agent
    lines = []
    for r in results.data:
        lines.append(f"- {r.title}\n  {r.url}\n  {r.description or ''}")
    return {"content": [{"type": "text", "text": "\n".join(lines) or "No results found."}]}
```

### `web_scrape`

```python
@tool("web_scrape", "Extract content from a URL as markdown", {...})
async def web_scrape(args):
    app = FirecrawlApp(api_key=get_firecrawl_key())
    result = app.scrape(args["url"], formats=["markdown"])
    content = result.markdown or ""
    # Truncate for agent context
    return {"content": [{"type": "text", "text": content[:8000] or "Could not extract content."}]}
```

### `linkedin_lookup`

Same Stagehand implementation as current `linkedin.py` but wrapped as an MCP tool:

```python
@tool("linkedin_lookup", "Find and extract a LinkedIn profile", {...})
async def linkedin_lookup(args):
    result = await scrape_linkedin(args["name"], args.get("company"), args.get("title", ""))
    if result:
        return {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}
    return {"content": [{"type": "text", "text": "LinkedIn profile not found."}]}
```

---

## Files Changed/Created

| Path | Action | Purpose |
|---|---|---|
| `web/prisma/schema.prisma` | Modify | Add `EnrichmentLog` model + Candidate relation |
| `pipeline/src/scout/enrich.py` | Rewrite | Agent SDK session with 4 tools, replaces dumb enrichment |
| `pipeline/src/scout/web_enrich.py` | Delete | Replaced by agent enrichment |
| `pipeline/src/scout/web_search.py` | Modify | Keep as library, wrap functions as MCP tools |
| `pipeline/src/scout/linkedin.py` | Modify | Keep `scrape_linkedin`, wrap as MCP tool |
| `pipeline/src/scout/github.py` | Keep | Still used for `fetch-forks` (no agent needed for pagination) |
| `pipeline/src/scout/pipeline.py` | Modify | Remove `run_web_enrich`, update `run_enrich` to use agent, update `run_full_pipeline` |
| `pipeline/src/scout/cli.py` | Modify | Remove `web-enrich` command, update `enrich` description |
| `pipeline/src/scout/deep_dive.py` | Modify | Simplify to re-run agent enrichment for one candidate |
| `pipeline/src/scout/prompts.py` | Keep | Used by `analyze` step (unchanged) |
| `pipeline/src/scout/db.py` | Modify | Add `insert_enrichment_log` helper |
| `mise.toml` | Modify | Remove `web-enrich` task |

---

## CLI Changes

| Before | After |
|---|---|
| `scout fetch-forks` | `scout fetch-forks` (unchanged) |
| `scout enrich --limit N` | `scout enrich --limit N` (now agent-driven) |
| `scout web-enrich --limit N` | **Removed** |
| `scout analyze --limit N` | `scout analyze --limit N` (unchanged) |
| `scout run` | `scout run` (now: fetch → enrich → analyze) |
| `scout deep-dive <login>` | `scout deep-dive <login>` (re-runs agent enrichment for one candidate) |
| `scout stats` | `scout stats` (add enrichment log count) |

---

## Cost & Throughput

- Agent session: ~$0.10-0.30 per candidate (Claude Agent SDK + tool calls)
- Firecrawl: ~5-10 API calls per candidate (search + scrapes)
- Stagehand: ~1 session per candidate (~30-60s)
- **Total per candidate: ~$0.15-0.40**
- **899 candidates full batch: ~$200-350**
- **Wall-clock: ~2-3 min per candidate, ~30 hours sequential**
- Run with `--limit` for validation, batch overnight for full run
