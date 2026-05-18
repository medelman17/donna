# Postgres + Agent-Driven Enrichment — Combined Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Migrate from SQLite to Postgres 18 + pgvector, replace dumb enrichment with Claude Agent SDK sessions, add Redis for tool call caching, add embedding columns for similarity search, add agent memory table for cross-session observations.
**Supersedes:** `2026-05-18-agent-enrichment-design.md` and `2026-05-18-web-enrichment-design.md`

---

## 1. Infrastructure

### docker-compose.yml (project root)

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg18
    ports: ["54320:5432"]
    environment:
      POSTGRES_DB: scout
      POSTGRES_USER: scout
      POSTGRES_PASSWORD: scout_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scout"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:8-alpine
    ports: ["63790:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
```

**Ports:** Postgres on `54320`, Redis on `63790` — non-standard to avoid conflicts.

### Environment variables

Add to `mise.local.toml`:

```toml
DATABASE_URL = "postgresql://scout:scout_dev@localhost:54320/scout"
REDIS_URL = "redis://localhost:63790"
```

The web app's `web/.env` also changes:

```env
DATABASE_URL="postgresql://scout:scout_dev@localhost:54320/scout"
```

### mise.toml additions

```toml
[tasks.up]
description = "Start Postgres + Redis containers"
run = "docker compose up -d"

[tasks.down]
description = "Stop containers"
run = "docker compose down"

[tasks.db-reset]
description = "Reset database (drop + migrate)"
dir = "web"
run = "npx prisma migrate reset --force"
```

---

## 2. Prisma Migration: SQLite → Postgres

### Schema changes

**datasource:**
```prisma
datasource db {
  provider = "postgresql"
}
```

**generator:** stays `prisma-client` with same output path.

**Adapter change (web/src/lib/prisma.ts):**
```typescript
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
```

**Package changes:**
- Remove: `@prisma/adapter-better-sqlite3`, `better-sqlite3`, `@types/better-sqlite3`
- Add: `@prisma/adapter-pg`, `pg`

### New extensions (in migration SQL)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### All existing models carry over unchanged

`Candidate`, `ForkMeta`, `Repo`, `Event`, `Profile`, `Signal`, `Skill`, `Crm`, `LinkedInProfile`, `WebMention` — same fields, same relations, same cascade deletes. Postgres handles them identically to SQLite.

### New models

#### EnrichmentLog

Provenance log for every tool call the agent makes.

```prisma
model EnrichmentLog {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  tool           String    // "gh_query" | "web_search" | "web_scrape" | "linkedin_lookup"
  input          Json      // tool call arguments
  output         Json      // raw tool response (truncated)
  durationMs     Int?
  error          String?   // error message if tool call failed
  createdAt      DateTime  @default(now())

  @@index([candidateLogin])
  @@index([tool])
  @@index([createdAt])
}
```

#### AgentMemory

Cross-session agent observations. The agent can note patterns it discovers (e.g. "this company's LinkedIn uses a specific URL pattern", "this conference keeps appearing for AI-legal candidates").

```prisma
model AgentMemory {
  id             Int       @id @default(autoincrement())
  key            String    @unique // namespaced key, e.g. "company:google:linkedin_pattern"
  value          String    // observation text
  candidateLogin String?   // optional — some memories are global, some per-candidate
  candidate      Candidate? @relation(fields: [candidateLogin], references: [login], onDelete: SetNull)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([candidateLogin])
}
```

#### Embedding column on Profile

```prisma
model Profile {
  // ... existing fields ...
  embedding      Unsupported("vector(1536)")?
}
```

Prisma doesn't natively support pgvector types, so we use `Unsupported("vector(1536)")`. Reads and writes to this column go through raw SQL (`$queryRaw` / `$executeRaw`) or through the Python side via psycopg.

**Candidate model** gains new relations:

```prisma
model Candidate {
  // ... existing fields and relations ...
  enrichmentLogs  EnrichmentLog[]
  agentMemories   AgentMemory[]
}
```

---

## 3. Python Side: SQLite → Postgres

### Package changes

- Remove: no sqlite3 changes needed (it's stdlib, just stop using it)
- Add to `pyproject.toml`: `psycopg[binary]>=3.2`, `redis>=5.0`

### db.py rewrite

Replace `sqlite3` connections with `psycopg` connections. The SQL syntax differences:

| SQLite | Postgres |
|---|---|
| `?` placeholder | `%s` placeholder |
| `ON CONFLICT(col) DO UPDATE SET` | Same (Postgres invented it) |
| `PRAGMA journal_mode=WAL` | Not needed (Postgres has WAL by default) |
| `PRAGMA busy_timeout=5000` | Connection pool handles this |
| `BOOLEAN` stored as 0/1 | Native `BOOLEAN` |
| `datetime` as text | Native `TIMESTAMP` |

The `connect()` function becomes:

```python
import psycopg

def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL", "postgresql://scout:scout_dev@localhost:54320/scout")
    return psycopg.connect(url, autocommit=False, row_factory=psycopg.rows.dict_row)
```

All SQL in upsert/insert helpers changes `?` to `%s`. Column names and table names stay the same (Prisma generates identical DDL for Postgres).

### config.py changes

- Remove `DB_PATH` (no more file path)
- Add `get_database_url()` and `get_redis_url()`

---

## 4. Redis Caching Layer

### Purpose

Replace the JSON file cache (`pipeline/.cache/`) with Redis TTL keys. Benefits:
- Shared across concurrent agent sessions
- Automatic expiry (no stale files)
- Queryable (see what's cached)

### cache.py (new module)

```python
import json
import hashlib
import redis

_client: redis.Redis | None = None

def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_redis_url(), decode_responses=True)
    return _client

def cache_get(namespace: str, key: str) -> Any | None:
    r = get_redis()
    val = r.get(f"scout:{namespace}:{_hash(key)}")
    return json.loads(val) if val else None

def cache_set(namespace: str, key: str, value: Any, ttl: int = 86400) -> None:
    r = get_redis()
    r.setex(f"scout:{namespace}:{_hash(key)}", ttl, json.dumps(value, default=str))

def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]
```

### Usage in tools

```python
# In gh_query tool:
cached = cache_get("gh", endpoint)
if cached:
    return cached
result = subprocess.run(["gh", "api", endpoint], ...)
cache_set("gh", endpoint, result, ttl=3600)  # 1 hour

# In web_search tool:
cached = cache_get("firecrawl_search", query)
if cached:
    return cached
result = app.search(query, limit=limit)
cache_set("firecrawl_search", query, result, ttl=86400)  # 24 hours

# In web_scrape tool:
cached = cache_get("firecrawl_scrape", url)
if cached:
    return cached
result = app.scrape(url, formats=["markdown"])
cache_set("firecrawl_scrape", url, result, ttl=86400)  # 24 hours
```

LinkedIn lookups are NOT cached (too dynamic, and Stagehand sessions are expensive to waste on stale data).

### TTLs

| Namespace | TTL | Rationale |
|---|---|---|
| `gh` (GitHub API) | 1 hour | GitHub data changes slowly; 1h avoids re-hitting rate limits |
| `firecrawl_search` | 24 hours | Search results don't change fast |
| `firecrawl_scrape` | 24 hours | Page content is stable |
| `linkedin` | Not cached | Expensive to look up, but data should be fresh |

---

## 5. Agent-Driven Enrichment

### Architecture

Each candidate gets a Claude Agent SDK session with 4 tools. The agent autonomously pulls GitHub data, reasons about what to search for, searches the web, scrapes pages, and looks up LinkedIn.

### Tools

| Tool | Backend | Purpose |
|---|---|---|
| `gh_query(endpoint, jq_filter?)` | `gh` CLI + Redis cache | Pull GitHub API data |
| `web_search(query, limit?)` | Firecrawl `search()` + Redis cache | Search Google |
| `web_scrape(url)` | Firecrawl `scrape()` + Redis cache | Extract markdown from URL |
| `linkedin_lookup(name, company?, title?)` | Stagehand/Browserbase | Find + extract LinkedIn profile |

All four register as MCP tools via `create_sdk_mcp_server()`.

### Tool side effects

Each tool wrapper does TWO things:
1. Returns text to the agent (so it can reason about results)
2. Persists data to Postgres as a side effect (so data is saved even if the agent session crashes)

| Tool call | Side-effect persistence |
|---|---|
| `gh_query /users/{login}` | Upserts `Candidate` row |
| `gh_query /users/{login}/repos` | Upserts `Repo` rows |
| `gh_query /users/{login}/events` | Upserts `Event` rows |
| `web_search *` | Logged to `EnrichmentLog` only (agent decides what to scrape) |
| `web_scrape *` | Inserts `WebMention` row |
| `linkedin_lookup *` | Upserts `LinkedInProfile` row |

ALL tool calls log to `EnrichmentLog` regardless.

### System prompt

See `2026-05-18-agent-enrichment-design.md` for the full system prompt. It instructs the agent to:
1. Pull GitHub profile → repos → events
2. Read what it found (bio, company, blog URL, languages)
3. Construct intelligent search queries based on context
4. Search, scrape, LinkedIn lookup as warranted
5. Be smart about sparse profiles (don't search for ghosts)

### Agent options

```python
ClaudeAgentOptions(
    system_prompt=ENRICHMENT_SYSTEM_PROMPT,
    mcp_servers={"tools": enrichment_mcp_server},
    allowed_tools=[
        "mcp__tools__gh_query",
        "mcp__tools__web_search",
        "mcp__tools__web_scrape",
        "mcp__tools__linkedin_lookup",
    ],
    max_turns=30,
)
```

### Prompt per candidate

```
Research the GitHub developer "{login}" who forked willchen96/mike (an AI legal platform). Start by pulling their GitHub data, then search the web based on what you find.
```

---

## 6. Embeddings (pgvector)

### When embeddings are generated

During the `analyze` step (Claude Opus 4.7 assessment), after Claude produces the profile, we embed the summary + skills + signals into a 1536-dim vector using Anthropic's Voyage API (key already in `mise.local.toml` as `VOYAGE_API_KEY`) or OpenAI embeddings.

### Storage

```sql
-- Raw SQL via psycopg (Prisma can't write vector columns natively)
UPDATE "Profile"
SET embedding = %s::vector
WHERE "candidateLogin" = %s
```

### Queries

```sql
-- Find candidates most similar to a given candidate
SELECT c.login, c.name, p.summary,
       p.embedding <=> (SELECT embedding FROM "Profile" WHERE "candidateLogin" = %s) AS distance
FROM "Candidate" c
JOIN "Profile" p ON p."candidateLogin" = c.login
WHERE p.embedding IS NOT NULL
ORDER BY distance
LIMIT 10;
```

### API endpoint (future)

Add a `/api/similar/[login]` route to the web app that returns the 10 most similar candidates. Not in scope for this implementation — just ensure the column exists and gets populated.

---

## 7. Pipeline Changes

### Updated flow

```
fetch-forks → enrich → analyze
```

- `fetch-forks` — unchanged (paginate gh API, insert Candidate + ForkMeta rows)
- `enrich` — now agent-driven (Claude Agent SDK per candidate)
- `analyze` — unchanged (Claude Opus 4.7 assessment + embedding generation)
- `web-enrich` — **removed**
- `deep-dive` — becomes alias for `enrich --login <login>` (re-runs agent for one candidate)

### CLI

```
scout fetch-forks              # unchanged
scout enrich [--limit N]       # agent-driven enrichment
scout analyze [--limit N]      # Claude assessment (unchanged)
scout run                      # fetch → enrich → analyze
scout deep-dive <login>        # re-enrich one candidate
scout stats                    # counts + enrichment log stats
```

---

## 8. Files Changed/Created

| Path | Action | Purpose |
|---|---|---|
| `docker-compose.yml` | Create | Postgres 18 + pgvector + Redis 8 |
| `mise.toml` | Modify | Add `up`/`down`/`db-reset` tasks, remove `web-enrich` |
| `web/.env` | Modify | Postgres connection string |
| `web/prisma/schema.prisma` | Modify | Switch to `postgresql`, add EnrichmentLog, AgentMemory, Profile.embedding |
| `web/prisma.config.ts` | Keep | Already reads `DATABASE_URL` from env |
| `web/package.json` | Modify | Swap `better-sqlite3` → `pg`, `@prisma/adapter-better-sqlite3` → `@prisma/adapter-pg` |
| `web/src/lib/prisma.ts` | Modify | Use `PrismaPg` adapter |
| `pipeline/pyproject.toml` | Modify | Add `psycopg[binary]`, `redis`; keep `stagehand`, `firecrawl-py` |
| `pipeline/src/scout/config.py` | Modify | Remove `DB_PATH`, add `get_database_url()`, `get_redis_url()` |
| `pipeline/src/scout/db.py` | Rewrite | psycopg instead of sqlite3, `%s` placeholders, add `insert_enrichment_log` |
| `pipeline/src/scout/cache.py` | Create | Redis caching layer |
| `pipeline/src/scout/enrich.py` | Rewrite | Agent SDK session with 4 MCP tools |
| `pipeline/src/scout/tools.py` | Create | MCP tool definitions (gh_query, web_search, web_scrape, linkedin_lookup) with side-effect persistence + provenance logging |
| `pipeline/src/scout/linkedin.py` | Modify | Keep `scrape_linkedin()`, remove tool wrapper (moved to tools.py) |
| `pipeline/src/scout/web_search.py` | Delete | Functionality moved to tools.py |
| `pipeline/src/scout/web_enrich.py` | Delete | Replaced by agent enrichment |
| `pipeline/src/scout/pipeline.py` | Modify | Remove `run_web_enrich`, update `run_enrich` |
| `pipeline/src/scout/cli.py` | Modify | Remove `web-enrich`, update descriptions |
| `pipeline/src/scout/deep_dive.py` | Simplify | Alias for agent enrichment on one candidate |
| `pipeline/src/scout/github.py` | Modify | Use Redis cache instead of JSON files |

---

## 9. Migration Strategy

1. `docker compose up -d` — start Postgres + Redis
2. `cd web && npm install` — swap packages
3. `npx prisma migrate dev --name postgres-init` — create all tables fresh in Postgres
4. `cd ../pipeline && uv sync` — install psycopg + redis
5. `mise run fetch-forks` — repopulate candidates from GitHub (fast, ~30s)
6. `mise run enrich -- --limit 5` — test agent enrichment on 5 candidates
7. `mise run analyze -- --limit 5` — test analysis

SQLite data is NOT migrated — we re-run the pipeline from scratch. The fork list is deterministic (same ~899 forks), and enrichment is idempotent.

---

## 10. Cost Estimates

| Step | Per candidate | 899 candidates |
|---|---|---|
| Agent enrichment (Claude Agent SDK) | ~$0.15-0.30 | ~$150-270 |
| Firecrawl (search + scrape) | ~$0.02-0.05 | ~$20-45 |
| Stagehand/LinkedIn | ~$0.05-0.10 | ~$45-90 |
| Claude analysis (Opus 4.7) | ~$0.10-0.15 | ~$90-135 |
| Embeddings (Voyage) | ~$0.001 | ~$1 |
| **Total** | **~$0.35-0.60** | **~$300-540** |

Wall-clock: ~2-3 min per candidate for enrichment, ~30s for analysis. Full batch: ~35 hours sequential. Recommend `--limit 20` for validation, then batch overnight.
