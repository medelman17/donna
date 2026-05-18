# Postgres + Agent-Driven Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from SQLite to Postgres 18 + pgvector + Redis, replace dumb enrichment with Claude Agent SDK sessions that autonomously research each candidate, add provenance logging, and enable web-triggered enrichment with live progress updates.

**Architecture:** Docker Compose provides Postgres 18 (pgvector) on port 54320 and Redis 8 on port 63790. Prisma schema migrates to `postgresql` provider with new `EnrichmentLog` and `AgentMemory` models. Python pipeline switches from `sqlite3` to `psycopg`, tool call results cache in Redis. The `enrich` command becomes a Claude Agent SDK session per candidate with 4 MCP tools (`gh_query`, `web_search`, `web_scrape`, `linkedin_lookup`) that each persist data as a side effect and log to `EnrichmentLog`. The web app gains a server action to trigger enrichment via a background subprocess, with SSE-style polling for live progress visible in the detail page.

**Tech Stack:**
- Docker Compose (Postgres 18 pgvector, Redis 8)
- Prisma 7 with `@prisma/adapter-pg` + `pg`
- Python: `psycopg[binary]>=3.2`, `redis>=5.0`, `claude-agent-sdk>=0.2.82`
- Next.js 16 server actions for enrichment triggers

**Phases:**
1. **Infrastructure** (Tasks 1-4): Docker, Postgres, Redis, package swaps
2. **Data layer** (Tasks 5-6): db.py rewrite, Redis cache module
3. **Agent enrichment** (Tasks 7-10): Tools, agent session, pipeline/CLI update
4. **Web triggers + live progress** (Tasks 11-12): Server action, progress UI

---

## File Map (changes from current state)

```
NEW FILES:
  docker-compose.yml                    Docker Compose for Postgres + Redis
  pipeline/src/scout/cache.py           Redis caching layer
  pipeline/src/scout/tools.py           4 MCP tool definitions with side-effect persistence
  web/src/app/api/enrich/route.ts       API route to trigger enrichment
  web/src/app/api/enrich/[login]/route.ts  Per-candidate enrichment status
  web/src/components/enrich-button.tsx   Client component for triggering enrichment

REWRITTEN FILES:
  web/prisma/schema.prisma              postgresql provider + new models
  web/package.json                      Swap better-sqlite3 → pg
  web/src/lib/prisma.ts                 PrismaPg adapter
  pipeline/pyproject.toml               Add psycopg, redis
  pipeline/src/scout/config.py          DATABASE_URL, REDIS_URL
  pipeline/src/scout/db.py             psycopg instead of sqlite3
  pipeline/src/scout/enrich.py          Agent SDK session with 4 tools
  pipeline/src/scout/pipeline.py        Remove web-enrich, update enrich
  pipeline/src/scout/cli.py             Remove web-enrich command, add verbose logging
  pipeline/src/scout/deep_dive.py       Simplify to alias for agent enrichment

DELETED FILES:
  pipeline/src/scout/web_enrich.py      Replaced by agent enrichment
  pipeline/src/scout/web_search.py      Functionality moved to tools.py

MODIFIED FILES:
  mise.toml                             Add up/down tasks, remove web-enrich
  web/.env                              Postgres connection string
  web/src/app/candidates/[login]/page.tsx  Add enrich button
  web/src/app/candidates/[login]/actions.ts  Add triggerEnrich action
```

---

## Task 1: Docker Compose + Infrastructure

**Files:**
- Create: `docker-compose.yml`
- Modify: `mise.toml`
- Modify: `web/.env`

- [ ] **Step 1: Create `docker-compose.yml`**

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

- [ ] **Step 2: Update `web/.env`**

```env
DATABASE_URL="postgresql://scout:scout_dev@localhost:54320/scout"
```

- [ ] **Step 3: Update `mise.toml`**

Add infrastructure tasks, remove `web-enrich`:

```toml
[tools]
python = "3.12"
node = "24"
uv = "latest"

[tasks.up]
description = "Start Postgres + Redis"
run = "docker compose up -d && echo 'Waiting for healthy...' && sleep 3 && docker compose ps"

[tasks.down]
description = "Stop containers"
run = "docker compose down"

[tasks.db-reset]
description = "Reset database"
dir = "web"
run = "npx prisma migrate reset --force"

[tasks.fetch-forks]
description = "Fetch all forks of willchen96/mike"
dir = "pipeline"
run = "uv run scout fetch-forks"

[tasks.enrich]
description = "Agent-driven enrichment (GitHub + web + LinkedIn)"
dir = "pipeline"
raw = true
run = "uv run scout enrich $@"

[tasks.analyze]
description = "Claude Opus 4.7 analysis"
dir = "pipeline"
raw = true
run = "uv run scout analyze $@"

[tasks.run]
description = "Full pipeline: fetch → enrich → analyze"
dir = "pipeline"
run = "uv run scout run"

[tasks.deep-dive]
description = "Re-enrich one candidate"
dir = "pipeline"
raw = true
run = "uv run scout deep-dive $@"

[tasks.stats]
description = "Print pipeline statistics"
dir = "pipeline"
run = "uv run scout stats"

[tasks.dev]
description = "Start Next.js dev server"
dir = "web"
run = "npm run dev"

[tasks.build]
description = "Build Next.js app"
dir = "web"
run = "npm run build"

[tasks.db-migrate]
description = "Run Prisma migrations"
dir = "web"
run = "npx prisma migrate dev"

[tasks.db-studio]
description = "Open Prisma Studio"
dir = "web"
run = "npx prisma studio"
```

- [ ] **Step 4: Start containers and verify**

Run: `docker compose up -d && docker compose ps`
Expected: Both services show "healthy".

Run: `psql postgresql://scout:scout_dev@localhost:54320/scout -c "SELECT 1"`
Expected: Returns 1.

Run: `redis-cli -p 63790 ping`
Expected: PONG.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml mise.toml web/.env
git commit -m "feat: docker compose with Postgres 18 + pgvector + Redis 8"
```

---

## Task 2: Prisma Schema Migration to Postgres

**Files:**
- Modify: `web/prisma/schema.prisma`
- Modify: `web/package.json`
- Modify: `web/src/lib/prisma.ts`

- [ ] **Step 1: Update `web/package.json`**

Replace SQLite deps with Postgres:

Remove from dependencies: `"@prisma/adapter-better-sqlite3"`, `"better-sqlite3"`
Add to dependencies: `"@prisma/adapter-pg": "^7.8.0"`, `"pg": "^8.16.0"`
Remove from devDependencies: `"@types/better-sqlite3"`

- [ ] **Step 2: Rewrite `web/prisma/schema.prisma`**

Change datasource provider and add new models. Full file:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Candidate {
  login           String    @id
  name            String?
  bio             String?
  location        String?
  company         String?
  blog            String?
  twitter         String?
  hireable        Boolean?
  followers       Int       @default(0)
  publicRepos     Int       @default(0)
  avatarUrl       String?
  htmlUrl         String?
  githubCreatedAt DateTime?
  fetchedAt       DateTime  @default(now())

  forkMeta        ForkMeta?
  repos           Repo[]
  events          Event[]
  profile         Profile?
  signals         Signal[]
  skills          Skill[]
  crm             Crm?
  linkedIn        LinkedInProfile?
  webMentions     WebMention[]
  enrichmentLogs  EnrichmentLog[]
  agentMemories   AgentMemory[]
}

model ForkMeta {
  id             Int       @id @default(autoincrement())
  candidateLogin String    @unique
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  forkHtmlUrl    String?
  forkPushedAt   DateTime?
  forkStars      Int       @default(0)
  aheadBy        Int       @default(0)
  behindBy       Int       @default(0)
  hasOwnCommits  Boolean   @default(false)
  defaultBranch  String?
}

model Repo {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  name           String
  htmlUrl        String
  description    String?
  language       String?
  stars          Int       @default(0)
  forks          Int       @default(0)
  pushedAt       DateTime?
  isFork         Boolean   @default(false)
}

model Event {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  type           String
  repoName       String?
  createdAt      DateTime
  payload        String?
}

model Profile {
  id                  Int       @id @default(autoincrement())
  candidateLogin      String    @unique
  candidate           Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  summary             String?
  seniority           String?
  fitScore            Int?
  fitReasoning        String?
  recommendedOutreach String?
  outreachReason      String?
  confidence          Float?
  model               String?
  promptVersion       Int       @default(1)
  generatedAt         DateTime  @default(now())
  rawJson             String?
  embedding           Unsupported("vector(1536)")?
}

model Signal {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  kind           String
  text           String
}

model Skill {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  name           String
}

model Crm {
  id             Int       @id @default(autoincrement())
  candidateLogin String    @unique
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  status         String    @default("new")
  notes          String?
  tags           String?
  updatedAt      DateTime  @updatedAt
}

model LinkedInProfile {
  id              Int       @id @default(autoincrement())
  candidateLogin  String    @unique
  candidate       Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  profileUrl      String?
  headline        String?
  currentTitle    String?
  currentCompany  String?
  location        String?
  connectionCount Int?
  experience      String?
  education       String?
  skills          String?
  certifications  String?
  scrapedAt       DateTime  @default(now())
}

model WebMention {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  url            String
  title          String?
  snippet        String?
  source         String
  content        String?
  scrapedAt      DateTime  @default(now())
}

model EnrichmentLog {
  id             Int       @id @default(autoincrement())
  candidateLogin String
  candidate      Candidate @relation(fields: [candidateLogin], references: [login], onDelete: Cascade)
  tool           String
  input          Json
  output         Json
  durationMs     Int?
  error          String?
  createdAt      DateTime  @default(now())

  @@index([candidateLogin])
  @@index([tool])
  @@index([createdAt])
}

model AgentMemory {
  id             Int        @id @default(autoincrement())
  key            String     @unique
  value          String
  candidateLogin String?
  candidate      Candidate? @relation(fields: [candidateLogin], references: [login], onDelete: SetNull)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([candidateLogin])
}
```

- [ ] **Step 3: Rewrite `web/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Install packages and run migration**

```bash
cd web && npm install
npx prisma migrate dev --name postgres-init
```

Expected: All tables created in Postgres. `npx prisma studio` opens and shows empty tables.

- [ ] **Step 5: Verify web build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: migrate Prisma to Postgres 18 with pgvector + new models"
```

---

## Task 3: Python Package Updates + Config

**Files:**
- Modify: `pipeline/pyproject.toml`
- Rewrite: `pipeline/src/scout/config.py`

- [ ] **Step 1: Update `pipeline/pyproject.toml`**

Add `psycopg[binary]` and `redis` to dependencies:

```toml
[project]
name = "scout"
version = "0.1.0"
description = "GitHub fork profiler pipeline for willchen96/mike"
requires-python = ">=3.11"
dependencies = [
    "anthropic>=0.102.0",
    "claude-agent-sdk>=0.2.82",
    "httpx>=0.28.1",
    "typer>=0.25.1",
    "rich>=15.0.0",
    "tenacity>=9.1.4",
    "stagehand>=3.19.5",
    "firecrawl-py",
    "pydantic>=2.0",
    "psycopg[binary]>=3.2",
    "redis>=5.0",
]

[project.scripts]
scout = "scout.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/scout"]
```

- [ ] **Step 2: Rewrite `pipeline/src/scout/config.py`**

```python
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CACHE_DIR = PROJECT_ROOT / "pipeline" / ".cache"
FORK_REPO = "willchen96/mike"
MODEL = "claude-opus-4-7"


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return key


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", "postgresql://scout:scout_dev@localhost:54320/scout")


def get_redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:63790")


def get_browserbase_keys() -> tuple[str, str]:
    api_key = os.environ.get("BROWSERBASE_API_KEY", "")
    project_id = os.environ.get("BROWSERBASE_PROJECT_ID", "")
    if not api_key or not project_id:
        raise RuntimeError("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set")
    return api_key, project_id


def get_firecrawl_key() -> str:
    key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not key:
        raise RuntimeError("FIRECRAWL_API_KEY not set")
    return key
```

- [ ] **Step 3: Sync and verify**

Run: `cd pipeline && uv sync`
Expected: psycopg and redis install.

Run: `cd pipeline && uv run python -c "import psycopg; import redis; print('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add pipeline/pyproject.toml pipeline/src/scout/config.py
git commit -m "feat: add psycopg + redis deps, update config for Postgres"
```

---

## Task 4: Redis Cache Module

**Files:**
- Create: `pipeline/src/scout/cache.py`

- [ ] **Step 1: Create `pipeline/src/scout/cache.py`**

```python
import json
import hashlib
import time
from typing import Any

import redis
from rich.console import Console

from scout.config import get_redis_url

console = Console()
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_redis_url(), decode_responses=True)
    return _client


def cache_get(namespace: str, key: str) -> Any | None:
    r = get_redis()
    cache_key = f"scout:{namespace}:{_hash(key)}"
    val = r.get(cache_key)
    if val:
        console.print(f"      [dim]cache hit: {namespace}/{key[:60]}[/dim]")
        return json.loads(val)
    return None


def cache_set(namespace: str, key: str, value: Any, ttl: int = 86400) -> None:
    r = get_redis()
    cache_key = f"scout:{namespace}:{_hash(key)}"
    r.setex(cache_key, ttl, json.dumps(value, default=str))


def cache_stats() -> dict[str, int]:
    r = get_redis()
    keys = list(r.scan_iter("scout:*", count=1000))
    by_ns: dict[str, int] = {}
    for k in keys:
        parts = k.split(":")
        ns = parts[1] if len(parts) >= 3 else "unknown"
        by_ns[ns] = by_ns.get(ns, 0) + 1
    return by_ns


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]
```

- [ ] **Step 2: Verify**

Run: `cd pipeline && uv run python -c "from scout.cache import get_redis; r = get_redis(); r.ping(); print('redis ok')"`
Expected: `redis ok`

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/scout/cache.py
git commit -m "feat: Redis caching layer for tool call results"
```

---

## Task 5: db.py Rewrite for Postgres

**Files:**
- Rewrite: `pipeline/src/scout/db.py`

- [ ] **Step 1: Rewrite `pipeline/src/scout/db.py`**

All `?` → `%s`, `sqlite3.Connection` → `psycopg.Connection`, add `insert_enrichment_log`. The file structure stays the same — same function names, same signatures (except connection type). Key changes:

- `connect()` uses `psycopg.connect()` with `row_factory=psycopg.rows.dict_row`
- All parameter placeholders change from `?` to `%s`
- Remove PRAGMA statements (Postgres doesn't need them)
- Add `insert_enrichment_log()` function
- Add `get_enrichment_status()` for web progress polling

```python
import psycopg
import psycopg.rows
import json
import time
from datetime import datetime, timezone
from typing import Any

from scout.config import get_database_url


def connect() -> psycopg.Connection:
    return psycopg.connect(
        get_database_url(),
        autocommit=False,
        row_factory=psycopg.rows.dict_row,
    )


# --- Candidate ---

def upsert_candidate(conn: psycopg.Connection, c: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "Candidate"
           (login, name, bio, location, company, blog, twitter,
            hireable, followers, "publicRepos", "avatarUrl", "htmlUrl",
            "githubCreatedAt", "fetchedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT(login) DO UPDATE SET
             name=EXCLUDED.name, bio=EXCLUDED.bio, location=EXCLUDED.location,
             company=EXCLUDED.company, blog=EXCLUDED.blog, twitter=EXCLUDED.twitter,
             hireable=EXCLUDED.hireable, followers=EXCLUDED.followers,
             "publicRepos"=EXCLUDED."publicRepos", "avatarUrl"=EXCLUDED."avatarUrl",
             "htmlUrl"=EXCLUDED."htmlUrl", "githubCreatedAt"=EXCLUDED."githubCreatedAt",
             "fetchedAt"=EXCLUDED."fetchedAt"
        """,
        (
            c["login"], c.get("name"), c.get("bio"), c.get("location"),
            c.get("company"), c.get("blog"), c.get("twitter"),
            c.get("hireable"), c.get("followers", 0), c.get("public_repos", 0),
            c.get("avatar_url"), c.get("html_url"),
            c.get("created_at"), datetime.now(timezone.utc).isoformat(),
        ),
    )


# --- ForkMeta ---

def upsert_fork_meta(conn: psycopg.Connection, login: str, f: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "ForkMeta"
           ("candidateLogin", "forkHtmlUrl", "forkPushedAt", "forkStars",
            "aheadBy", "behindBy", "hasOwnCommits", "defaultBranch")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             "forkHtmlUrl"=EXCLUDED."forkHtmlUrl", "forkPushedAt"=EXCLUDED."forkPushedAt",
             "forkStars"=EXCLUDED."forkStars", "aheadBy"=EXCLUDED."aheadBy",
             "behindBy"=EXCLUDED."behindBy", "hasOwnCommits"=EXCLUDED."hasOwnCommits",
             "defaultBranch"=EXCLUDED."defaultBranch"
        """,
        (
            login, f.get("html_url"), f.get("pushed_at"), f.get("stargazers_count", 0),
            f.get("ahead_by", 0), f.get("behind_by", 0),
            f.get("has_own_commits", False), f.get("default_branch"),
        ),
    )


# --- Repo ---

def insert_repos(conn: psycopg.Connection, login: str, repos: list[dict]) -> None:
    conn.execute("""DELETE FROM "Repo" WHERE "candidateLogin" = %s""", (login,))
    for r in repos:
        conn.execute(
            """INSERT INTO "Repo"
               ("candidateLogin", name, "htmlUrl", description, language, stars, forks, "pushedAt", "isFork")
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (login, r["name"], r["html_url"], r.get("description"),
             r.get("language"), r.get("stargazers_count", 0),
             r.get("forks_count", 0), r.get("pushed_at"), r.get("fork", False)),
        )


# --- Event ---

def insert_events(conn: psycopg.Connection, login: str, events: list[dict]) -> None:
    conn.execute("""DELETE FROM "Event" WHERE "candidateLogin" = %s""", (login,))
    for e in events:
        conn.execute(
            """INSERT INTO "Event" ("candidateLogin", type, "repoName", "createdAt", payload)
               VALUES (%s, %s, %s, %s, %s)""",
            (login, e["type"], e.get("repo", {}).get("name"),
             e["created_at"], json.dumps(e.get("payload", {}))[:2000]),
        )


# --- Profile ---

def upsert_profile(conn: psycopg.Connection, login: str, p: dict[str, Any], prompt_version: int = 1) -> None:
    conn.execute(
        """INSERT INTO "Profile"
           ("candidateLogin", summary, seniority, "fitScore", "fitReasoning",
            "recommendedOutreach", "outreachReason", confidence, model,
            "promptVersion", "generatedAt", "rawJson")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             summary=EXCLUDED.summary, seniority=EXCLUDED.seniority,
             "fitScore"=EXCLUDED."fitScore", "fitReasoning"=EXCLUDED."fitReasoning",
             "recommendedOutreach"=EXCLUDED."recommendedOutreach",
             "outreachReason"=EXCLUDED."outreachReason",
             confidence=EXCLUDED.confidence, model=EXCLUDED.model,
             "promptVersion"=EXCLUDED."promptVersion",
             "generatedAt"=EXCLUDED."generatedAt", "rawJson"=EXCLUDED."rawJson"
        """,
        (login, p.get("summary"), p.get("seniority"), p.get("fit_score"),
         p.get("fit_reasoning"), p.get("recommended_outreach"),
         p.get("outreach_reason"), p.get("confidence"),
         p.get("model"), prompt_version,
         datetime.now(timezone.utc).isoformat(), json.dumps(p)),
    )


# --- Signal / Skill ---

def insert_signals(conn: psycopg.Connection, login: str, signals: list[dict]) -> None:
    conn.execute("""DELETE FROM "Signal" WHERE "candidateLogin" = %s""", (login,))
    for s in signals:
        conn.execute(
            """INSERT INTO "Signal" ("candidateLogin", kind, text) VALUES (%s, %s, %s)""",
            (login, s["kind"], s["text"]),
        )


def insert_skills(conn: psycopg.Connection, login: str, skills: list[str]) -> None:
    conn.execute("""DELETE FROM "Skill" WHERE "candidateLogin" = %s""", (login,))
    for name in skills:
        conn.execute(
            """INSERT INTO "Skill" ("candidateLogin", name) VALUES (%s, %s)""",
            (login, name),
        )


# --- Crm ---

def ensure_crm(conn: psycopg.Connection, login: str) -> None:
    conn.execute(
        """INSERT INTO "Crm" ("candidateLogin", status, "updatedAt")
           VALUES (%s, 'new', %s) ON CONFLICT("candidateLogin") DO NOTHING""",
        (login, datetime.now(timezone.utc).isoformat()),
    )


# --- LinkedInProfile ---

def upsert_linkedin_profile(conn: psycopg.Connection, login: str, data: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "LinkedInProfile"
           ("candidateLogin", "profileUrl", headline, "currentTitle", "currentCompany",
            location, "connectionCount", experience, education, skills, certifications, "scrapedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             "profileUrl"=EXCLUDED."profileUrl", headline=EXCLUDED.headline,
             "currentTitle"=EXCLUDED."currentTitle", "currentCompany"=EXCLUDED."currentCompany",
             location=EXCLUDED.location, "connectionCount"=EXCLUDED."connectionCount",
             experience=EXCLUDED.experience, education=EXCLUDED.education,
             skills=EXCLUDED.skills, certifications=EXCLUDED.certifications,
             "scrapedAt"=EXCLUDED."scrapedAt"
        """,
        (login, data.get("profile_url"), data.get("headline"),
         data.get("current_title"), data.get("current_company"),
         data.get("location"), data.get("connection_count"),
         json.dumps(data.get("experience", [])),
         json.dumps(data.get("education", [])),
         json.dumps(data.get("skills", [])),
         json.dumps(data.get("certifications", [])),
         datetime.now(timezone.utc).isoformat()),
    )


# --- WebMention ---

def insert_web_mentions(conn: psycopg.Connection, login: str, mentions: list[dict]) -> None:
    conn.execute("""DELETE FROM "WebMention" WHERE "candidateLogin" = %s""", (login,))
    for m in mentions:
        conn.execute(
            """INSERT INTO "WebMention" ("candidateLogin", url, title, snippet, source, content, "scrapedAt")
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (login, m["url"], m.get("title"), m.get("snippet"),
             m.get("source", "google"), (m.get("content") or "")[:5000],
             datetime.now(timezone.utc).isoformat()),
        )


# --- EnrichmentLog ---

def insert_enrichment_log(
    conn: psycopg.Connection, login: str, tool: str,
    input_data: dict, output_data: Any, duration_ms: int | None = None,
    error: str | None = None,
) -> None:
    output_str = json.dumps(output_data, default=str)[:10000] if output_data else "{}"
    conn.execute(
        """INSERT INTO "EnrichmentLog" ("candidateLogin", tool, input, output, "durationMs", error, "createdAt")
           VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s, %s)""",
        (login, tool, json.dumps(input_data), output_str, duration_ms, error,
         datetime.now(timezone.utc).isoformat()),
    )


# --- Queries ---

def get_unenriched_logins(conn: psycopg.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM "Candidate"
             WHERE login NOT IN (SELECT DISTINCT "candidateLogin" FROM "EnrichmentLog")
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unanalyzed_logins(conn: psycopg.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM "Candidate"
             WHERE login NOT IN (SELECT "candidateLogin" FROM "Profile")
             AND login IN (SELECT DISTINCT "candidateLogin" FROM "Repo")
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_candidate_bundle(conn: psycopg.Connection, login: str) -> dict[str, Any] | None:
    row = conn.execute("""SELECT * FROM "Candidate" WHERE login = %s""", (login,)).fetchone()
    if not row:
        return None
    c = dict(row)
    c["repos"] = [dict(r) for r in conn.execute(
        """SELECT * FROM "Repo" WHERE "candidateLogin" = %s ORDER BY stars DESC LIMIT 10""", (login,)).fetchall()]
    c["events"] = [dict(e) for e in conn.execute(
        """SELECT * FROM "Event" WHERE "candidateLogin" = %s ORDER BY "createdAt" DESC LIMIT 30""", (login,)).fetchall()]
    fork = conn.execute("""SELECT * FROM "ForkMeta" WHERE "candidateLogin" = %s""", (login,)).fetchone()
    c["fork_meta"] = dict(fork) if fork else None
    li = conn.execute("""SELECT * FROM "LinkedInProfile" WHERE "candidateLogin" = %s""", (login,)).fetchone()
    c["linkedin"] = dict(li) if li else None
    c["web_mentions"] = [dict(w) for w in conn.execute(
        """SELECT * FROM "WebMention" WHERE "candidateLogin" = %s ORDER BY "scrapedAt" DESC""", (login,)).fetchall()]
    return c


def get_enrichment_status(conn: psycopg.Connection, login: str) -> dict[str, Any]:
    logs = [dict(r) for r in conn.execute(
        """SELECT tool, error, "durationMs", "createdAt"
           FROM "EnrichmentLog" WHERE "candidateLogin" = %s
           ORDER BY "createdAt" DESC LIMIT 50""", (login,)).fetchall()]
    has_repos = conn.execute(
        """SELECT COUNT(*) as c FROM "Repo" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    has_profile = conn.execute(
        """SELECT COUNT(*) as c FROM "Profile" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    has_linkedin = conn.execute(
        """SELECT COUNT(*) as c FROM "LinkedInProfile" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    return {
        "login": login,
        "enriched": has_repos,
        "analyzed": has_profile,
        "hasLinkedIn": has_linkedin,
        "toolCalls": len(logs),
        "recentLogs": logs[:10],
    }


def get_stats(conn: psycopg.Connection) -> dict[str, int]:
    def count(sql: str) -> int:
        return conn.execute(sql).fetchone()["count"]
    return {
        "candidates": count("""SELECT COUNT(*) as count FROM "Candidate" """),
        "enriched": count("""SELECT COUNT(DISTINCT "candidateLogin") as count FROM "Repo" """),
        "analyzed": count("""SELECT COUNT(*) as count FROM "Profile" """),
        "tool_calls": count("""SELECT COUNT(*) as count FROM "EnrichmentLog" """),
        "new": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'new'"""),
        "reviewing": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'reviewing'"""),
        "interested": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'interested'"""),
        "contacted": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'contacted'"""),
        "passed": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'passed'"""),
        "hired": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'hired'"""),
    }
```

**IMPORTANT NOTE FOR IMPLEMENTER:** Postgres requires double-quoting camelCase column names (Prisma generates them as camelCase). Every column name like `candidateLogin`, `publicRepos`, `avatarUrl`, `htmlUrl`, `forkHtmlUrl`, etc. must be wrapped in double quotes in SQL. This is the single biggest gotcha in the migration.

- [ ] **Step 2: Verify connection**

Run: `cd pipeline && uv run python -c "from scout.db import connect; c = connect(); print(c.execute('SELECT 1 as val').fetchone()); c.close()"`
Expected: `{'val': 1}`

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/scout/db.py
git commit -m "feat: db.py rewrite for psycopg (Postgres)"
```

---

## Task 6: Agent Enrichment Tools

**Files:**
- Create: `pipeline/src/scout/tools.py`

This is the core of the new enrichment. Four MCP tools, each with:
- Redis caching (where appropriate)
- Side-effect persistence to Postgres
- Provenance logging to EnrichmentLog
- Rich console logging for visibility

- [ ] **Step 1: Create `pipeline/src/scout/tools.py`**

```python
import json
import subprocess
import time
from typing import Any

from claude_agent_sdk import tool, create_sdk_mcp_server
from firecrawl import FirecrawlApp
from rich.console import Console

from scout import db
from scout.cache import cache_get, cache_set
from scout.config import get_firecrawl_key, get_browserbase_keys, get_api_key

console = Console()

# Module-level state set per-candidate by the enrichment orchestrator
_current_login: str = ""
_current_conn: Any = None


def set_context(login: str, conn: Any) -> None:
    global _current_login, _current_conn
    _current_login = login
    _current_conn = conn


def _log(tool_name: str, input_data: dict, output: Any, duration_ms: int, error: str | None = None) -> None:
    if _current_conn and _current_login:
        db.insert_enrichment_log(_current_conn, _current_login, tool_name, input_data, output, duration_ms, error)
        _current_conn.commit()


# ─── Tool 1: gh_query ────────────────────────────────────────────────────────

@tool(
    "gh_query",
    "Query the GitHub REST API. Returns JSON. Use for profiles, repos, events, READMEs, commits.",
    {
        "type": "object",
        "properties": {
            "endpoint": {"type": "string", "description": "GitHub API path, e.g. /users/octocat"},
            "jq_filter": {"type": "string", "description": "Optional jq filter to apply"},
        },
        "required": ["endpoint"],
    },
)
async def gh_query(args: dict[str, Any]) -> dict[str, Any]:
    endpoint = args["endpoint"]
    start = time.time()
    console.print(f"      [cyan]gh api[/cyan] {endpoint}")

    cached = cache_get("gh", endpoint)
    if cached is not None:
        _log("gh_query", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": json.dumps(cached, default=str)[:10000]}]}

    cmd = ["gh", "api", endpoint]
    jq_filter = args.get("jq_filter")
    if jq_filter:
        cmd.extend(["--jq", jq_filter])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        duration = int((time.time() - start) * 1000)

        if result.returncode != 0:
            error_msg = result.stderr[:500]
            console.print(f"      [red]gh api error:[/red] {error_msg[:80]}")
            _log("gh_query", args, None, duration, error_msg)
            return {"content": [{"type": "text", "text": f"Error: {error_msg}"}], "is_error": True}

        data = json.loads(result.stdout) if result.stdout.strip() else {}
        cache_set("gh", endpoint, data, ttl=3600)

        # Side-effect: persist GitHub data
        _persist_gh_data(endpoint, data)

        preview = result.stdout[:200].replace("\n", " ")
        console.print(f"      [green]ok[/green] ({duration}ms, {len(result.stdout)} chars) {preview}...")
        _log("gh_query", args, data, duration)
        return {"content": [{"type": "text", "text": result.stdout[:10000] or "(empty)"}]}

    except subprocess.TimeoutExpired:
        duration = int((time.time() - start) * 1000)
        _log("gh_query", args, None, duration, "timeout")
        return {"content": [{"type": "text", "text": "gh api timed out"}], "is_error": True}
    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _log("gh_query", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Error: {e}"}], "is_error": True}


def _persist_gh_data(endpoint: str, data: Any) -> None:
    if not _current_conn or not _current_login:
        return
    try:
        if endpoint == f"/users/{_current_login}" and isinstance(data, dict):
            db.upsert_candidate(_current_conn, data)
            db.ensure_crm(_current_conn, _current_login)
            console.print(f"      [dim]→ persisted Candidate[/dim]")
        elif f"/users/{_current_login}/repos" in endpoint and isinstance(data, list):
            db.insert_repos(_current_conn, _current_login, data[:10])
            console.print(f"      [dim]→ persisted {min(len(data), 10)} Repos[/dim]")
        elif f"/users/{_current_login}/events" in endpoint and isinstance(data, list):
            db.insert_events(_current_conn, _current_login, data[:30])
            console.print(f"      [dim]→ persisted {min(len(data), 30)} Events[/dim]")
        _current_conn.commit()
    except Exception as e:
        console.print(f"      [yellow]persist warning: {e}[/yellow]")


# ─── Tool 2: web_search ──────────────────────────────────────────────────────

@tool(
    "web_search",
    "Search Google for a person or topic. Returns titles, URLs, and snippets.",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results (default 8)"},
        },
        "required": ["query"],
    },
)
async def web_search(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    limit = args.get("limit", 8)
    start = time.time()
    console.print(f"      [cyan]web_search[/cyan] {query}")

    cached = cache_get("firecrawl_search", query)
    if cached is not None:
        _log("web_search", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": cached}]}

    try:
        app = FirecrawlApp(api_key=get_firecrawl_key())
        result = app.search(query, limit=limit)
        duration = int((time.time() - start) * 1000)

        lines = []
        items = result.data if hasattr(result, "data") else (result if isinstance(result, list) else [])
        for r in items:
            title = getattr(r, "title", "") or (r.get("title", "") if isinstance(r, dict) else "")
            url = getattr(r, "url", "") or (r.get("url", "") if isinstance(r, dict) else "")
            desc = getattr(r, "description", "") or (r.get("description", "") if isinstance(r, dict) else "")
            if url:
                lines.append(f"- {title}\n  {url}\n  {desc[:150]}")

        text = "\n".join(lines) or "No results found."
        console.print(f"      [green]ok[/green] ({duration}ms, {len(items)} results)")
        cache_set("firecrawl_search", query, text, ttl=86400)
        _log("web_search", args, {"count": len(items)}, duration)
        return {"content": [{"type": "text", "text": text}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]web_search error:[/red] {e}")
        _log("web_search", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Search error: {e}"}], "is_error": True}


# ─── Tool 3: web_scrape ──────────────────────────────────────────────────────

@tool(
    "web_scrape",
    "Extract content from a URL as clean markdown. Use for blogs, personal sites, articles.",
    {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to scrape"},
        },
        "required": ["url"],
    },
)
async def web_scrape(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    start = time.time()
    console.print(f"      [cyan]web_scrape[/cyan] {url[:80]}")

    cached = cache_get("firecrawl_scrape", url)
    if cached is not None:
        _log("web_scrape", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": cached}]}

    try:
        app = FirecrawlApp(api_key=get_firecrawl_key())
        result = app.scrape(url, formats=["markdown"])
        duration = int((time.time() - start) * 1000)

        content = result.markdown if hasattr(result, "markdown") else ""
        if not content and isinstance(result, dict):
            content = result.get("markdown", "")

        # Side-effect: persist as WebMention
        if content and len(content) >= 100 and _current_conn and _current_login:
            title = getattr(result, "metadata", {}).get("title", "") if hasattr(result, "metadata") else ""
            source = "blog" if any(k in url.lower() for k in ["blog", "medium.com", "dev.to"]) else "google"
            db.insert_web_mentions(_current_conn, _current_login, [{
                "url": url, "title": title, "snippet": content[:300],
                "source": source, "content": content[:5000],
            }])
            _current_conn.commit()
            console.print(f"      [dim]→ persisted WebMention ({len(content)} chars)[/dim]")

        truncated = content[:8000] or "Could not extract content."
        console.print(f"      [green]ok[/green] ({duration}ms, {len(content)} chars)")
        cache_set("firecrawl_scrape", url, truncated, ttl=86400)
        _log("web_scrape", args, {"chars": len(content)}, duration)
        return {"content": [{"type": "text", "text": truncated}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]web_scrape error:[/red] {e}")
        _log("web_scrape", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Scrape error: {e}"}], "is_error": True}


# ─── Tool 4: linkedin_lookup ─────────────────────────────────────────────────

@tool(
    "linkedin_lookup",
    "Find and extract a LinkedIn profile. Uses a stealth browser — slow but thorough.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Person's full name"},
            "company": {"type": "string", "description": "Current or recent company (optional)"},
            "title": {"type": "string", "description": "Job title (optional)"},
        },
        "required": ["name"],
    },
)
async def linkedin_lookup(args: dict[str, Any]) -> dict[str, Any]:
    name = args["name"]
    company = args.get("company", "")
    start = time.time()
    console.print(f"      [cyan]linkedin_lookup[/cyan] {name} ({company or 'no company'})")

    try:
        from scout.linkedin import scrape_linkedin
        result = await scrape_linkedin(name, company, _current_login)
        duration = int((time.time() - start) * 1000)

        if result:
            if _current_conn and _current_login:
                db.upsert_linkedin_profile(_current_conn, _current_login, result)
                _current_conn.commit()
                console.print(f"      [dim]→ persisted LinkedInProfile[/dim]")

            text = json.dumps(result, indent=2, default=str)
            console.print(f"      [green]ok[/green] ({duration}ms) {result.get('headline', 'found')}")
            _log("linkedin_lookup", args, result, duration)
            return {"content": [{"type": "text", "text": text}]}
        else:
            console.print(f"      [dim]not found[/dim] ({duration}ms)")
            if _current_conn and _current_login:
                db.upsert_linkedin_profile(_current_conn, _current_login, {})
                _current_conn.commit()
            _log("linkedin_lookup", args, None, duration, "not found")
            return {"content": [{"type": "text", "text": "LinkedIn profile not found."}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]linkedin_lookup error:[/red] {e}")
        _log("linkedin_lookup", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"LinkedIn error: {e}"}], "is_error": True}


# ─── MCP Server ──────────────────────────────────────────────────────────────

enrichment_mcp_server = create_sdk_mcp_server(
    name="tools",
    version="1.0.0",
    tools=[gh_query, web_search, web_scrape, linkedin_lookup],
)
```

- [ ] **Step 2: Verify imports**

Run: `cd pipeline && uv run python -c "from scout.tools import enrichment_mcp_server; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/scout/tools.py
git commit -m "feat: 4 MCP tools with side-effect persistence and provenance logging"
```

---

## Task 7: Agent-Driven Enrichment

**Files:**
- Rewrite: `pipeline/src/scout/enrich.py`

- [ ] **Step 1: Rewrite `pipeline/src/scout/enrich.py`**

```python
import asyncio
import json
import time
from typing import Any

from claude_agent_sdk import (
    query, ClaudeAgentOptions,
    ResultMessage, AssistantMessage, ToolUseBlock,
)
from rich.console import Console

from scout import db
from scout.tools import enrichment_mcp_server, set_context

console = Console()

ENRICHMENT_SYSTEM_PROMPT = """You are a talent research agent. Your job is to build a comprehensive profile of a software developer who forked an open-source AI legal platform (willchen96/mike on GitHub).

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

6. For promising search results, scrape the actual pages to get content

7. If you have a name + company or title, try linkedin_lookup

BE SMART:
- Don't search for people with no name and no bio — there's nothing to find
- If their GitHub is mostly forks with no own work, note that and move on quickly
- Blog URLs in the GitHub profile are the highest-value signal — always scrape those
- A bio like "Senior AI Engineer at Google" gives you everything for LinkedIn
- Don't make redundant searches
- Quality over quantity — 3 good findings beat 10 empty results
- Report what you found at the end as a summary"""


def enrich_candidate(login: str) -> dict[str, Any]:
    conn = db.connect()
    set_context(login, conn)
    start = time.time()

    console.print()
    console.rule(f"[bold]Enriching: {login}[/bold]", style="cyan")

    final_result = None
    tool_calls = 0

    try:
        for message in asyncio.get_event_loop().run_until_complete(_run_agent(login)):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        tool_calls += 1
            elif isinstance(message, ResultMessage) and message.subtype == "success":
                final_result = message.result
    except RuntimeError:
        # No running event loop — create one
        final_result = asyncio.run(_run_agent_collect(login))

    duration = int((time.time() - start) * 1000)

    console.print(f"\n  [bold green]Done[/bold green] — {tool_calls} tool calls in {duration/1000:.1f}s")
    if final_result:
        console.print(f"  [dim]{final_result[:200]}...[/dim]")

    conn.close()
    return {"login": login, "tool_calls": tool_calls, "duration_ms": duration}


async def _run_agent_collect(login: str) -> str | None:
    final = None
    async for message in _run_agent_stream(login):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            final = message.result
    return final


async def _run_agent_stream(login: str):
    async for message in query(
        prompt=(
            f"Research the GitHub developer '{login}' who forked willchen96/mike "
            f"(an AI legal platform). Start by pulling their GitHub data, then "
            f"use what you find to search the web for their professional presence."
        ),
        options=ClaudeAgentOptions(
            system_prompt=ENRICHMENT_SYSTEM_PROMPT,
            mcp_servers={"tools": enrichment_mcp_server},
            allowed_tools=[
                "mcp__tools__gh_query",
                "mcp__tools__web_search",
                "mcp__tools__web_scrape",
                "mcp__tools__linkedin_lookup",
            ],
            max_turns=30,
        ),
    ):
        yield message


# For the event loop issue, provide a sync wrapper
async def _run_agent(login: str):
    results = []
    async for msg in _run_agent_stream(login):
        results.append(msg)
    return results
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/enrich.py
git commit -m "feat: agent-driven enrichment with Claude Agent SDK"
```

---

## Task 8: Pipeline + CLI Update

**Files:**
- Rewrite: `pipeline/src/scout/pipeline.py`
- Rewrite: `pipeline/src/scout/cli.py`
- Modify: `pipeline/src/scout/deep_dive.py`
- Modify: `pipeline/src/scout/analyze.py`
- Delete: `pipeline/src/scout/web_enrich.py`
- Delete: `pipeline/src/scout/web_search.py`

- [ ] **Step 1: Rewrite `pipeline/src/scout/pipeline.py`**

Remove `run_web_enrich`, update `run_enrich` to use agent, update `run_analyze` for psycopg:

```python
import time

from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from scout import db, github
from scout.config import FORK_REPO
from scout.enrich import enrich_candidate
from scout.analyze import analyze_candidate

console = Console()


class RetryableError(Exception):
    pass


def run_fetch_forks() -> int:
    conn = db.connect()
    forks = github.fetch_forks(FORK_REPO)
    console.print(f"[bold]Fetched {len(forks)} forks[/bold]")

    for fork in forks:
        owner = fork.get("owner", {})
        candidate = {
            "login": owner.get("login"),
            "avatar_url": owner.get("avatar_url"),
            "html_url": owner.get("html_url"),
        }
        if not candidate["login"]:
            continue
        db.upsert_candidate(conn, candidate)
        db.upsert_fork_meta(conn, candidate["login"], fork)

    conn.commit()
    conn.close()
    return len(forks)


def run_enrich(limit: int | None = None) -> int:
    conn = db.connect()
    logins = db.get_unenriched_logins(conn, limit)
    conn.close()
    console.print(f"[bold]Agent-enriching {len(logins)} candidates[/bold]\n")

    enriched = 0
    for i, login in enumerate(logins, 1):
        console.print(f"[bold]── Candidate {i}/{len(logins)} ──[/bold]")
        try:
            result = enrich_candidate(login)
            enriched += 1
            console.print(
                f"  [green]{login}[/green] — {result['tool_calls']} tools, "
                f"{result['duration_ms']/1000:.1f}s"
            )
        except Exception as e:
            console.print(f"  [red]{login} failed: {e}[/red]")
        console.print()

    console.print(f"\n[bold]Enrichment complete: {enriched}/{len(logins)} candidates[/bold]")
    return enriched


@retry(
    retry=retry_if_exception_type(RetryableError),
    wait=wait_exponential(multiplier=2, min=4, max=120),
    stop=stop_after_attempt(3),
)
def _analyze_with_retry(bundle: dict) -> dict | None:
    try:
        conn = db.connect()
        result = analyze_candidate(conn, bundle)
        conn.close()
        return result
    except Exception as e:
        err = str(e).lower()
        if "429" in err or "overloaded" in err or "rate" in err or "529" in err:
            raise RetryableError(str(e)) from e
        raise


def run_analyze(limit: int | None = None) -> int:
    conn = db.connect()
    logins = db.get_unanalyzed_logins(conn, limit)
    console.print(f"[bold]Analyzing {len(logins)} candidates with Claude[/bold]")

    analyzed = 0
    total_input = 0
    total_output = 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("Analyzing...", total=len(logins))
        for login in logins:
            bundle = db.get_candidate_bundle(conn, login)
            if not bundle:
                progress.advance(task)
                continue
            try:
                result = _analyze_with_retry(bundle)
                if result:
                    analyzed += 1
                    total_input += result.get("input_tokens", 0)
                    total_output += result.get("output_tokens", 0)
                    progress.console.print(
                        f"  [green]{login}[/green] fit={result.get('fit_score')} "
                        f"in={result.get('input_tokens')} out={result.get('output_tokens')}"
                    )
            except Exception as e:
                console.print(f"[red]Failed to analyze {login}: {e}[/red]")
            progress.advance(task)

    conn.close()
    console.print(f"\n[bold]Analyzed {analyzed} candidates[/bold]")
    console.print(f"Tokens — input: {total_input}, output: {total_output}")
    return analyzed


def run_full_pipeline() -> None:
    run_fetch_forks()
    run_enrich()
    run_analyze()
```

- [ ] **Step 2: Rewrite `pipeline/src/scout/cli.py`**

Remove `web_enrich` command, update stats to show tool call counts:

```python
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from scout import db, pipeline
from scout.cache import cache_stats

app = typer.Typer(help="Talent Scout — GitHub fork profiler pipeline")
console = Console()


@app.command()
def fetch_forks():
    """Fetch all forks of willchen96/mike and store as Candidate rows."""
    count = pipeline.run_fetch_forks()
    console.print(f"[bold green]Done.[/bold green] {count} forks ingested.")


@app.command()
def enrich(limit: Optional[int] = typer.Option(None, help="Max candidates to enrich")):
    """Agent-driven enrichment (GitHub + web + LinkedIn) per candidate."""
    count = pipeline.run_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates enriched.")


@app.command()
def analyze(limit: Optional[int] = typer.Option(None, help="Max candidates to analyze")):
    """Analyze candidates with Claude Opus 4.7 (with live web tools)."""
    count = pipeline.run_analyze(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates analyzed.")


@app.command()
def run():
    """Run full pipeline: fetch-forks -> enrich -> analyze."""
    pipeline.run_full_pipeline()
    console.print("[bold green]Full pipeline complete.[/bold green]")


@app.command()
def deep_dive(login: str = typer.Argument(help="GitHub login to re-enrich")):
    """Re-run agent enrichment for a single candidate."""
    from scout.enrich import enrich_candidate
    result = enrich_candidate(login)
    console.print(f"[bold green]Done.[/bold green] {result['tool_calls']} tool calls.")


@app.command()
def stats():
    """Print pipeline statistics."""
    conn = db.connect()
    s = db.get_stats(conn)
    conn.close()

    table = Table(title="Talent Scout Stats")
    table.add_column("Metric", style="cyan")
    table.add_column("Count", justify="right", style="green")

    table.add_row("Total candidates", str(s["candidates"]))
    table.add_row("Enriched (have repos)", str(s["enriched"]))
    table.add_row("Analyzed (have profile)", str(s["analyzed"]))
    table.add_row("Tool calls logged", str(s["tool_calls"]))
    table.add_row("", "")
    for status in ["new", "reviewing", "interested", "contacted", "passed", "hired"]:
        table.add_row(f"Status: {status}", str(s[status]))

    # Redis cache stats
    try:
        cs = cache_stats()
        if cs:
            table.add_row("", "")
            table.add_row("[bold]Redis Cache[/bold]", "")
            for ns, count in sorted(cs.items()):
                table.add_row(f"  {ns}", str(count))
    except Exception:
        pass

    console.print(table)
```

- [ ] **Step 3: Update `pipeline/src/scout/analyze.py`**

Change `sqlite3.Connection` → `psycopg.Connection` in the type hint. The SQL in `_persist` doesn't change because it calls `db.*` functions which already handle the Postgres syntax.

Replace `import sqlite3` with `import psycopg` and update the type annotation on `analyze_candidate` and `_persist`:

```python
import json
import psycopg
import anthropic

from scout.config import MODEL, get_api_key
from scout.prompts import SYSTEM_PROMPT, TOOL_SCHEMA, build_user_message
from scout import db


MAX_CONTINUATIONS = 5


def analyze_candidate(conn: psycopg.Connection, bundle: dict) -> dict | None:
    login = bundle["login"]
    client = anthropic.Anthropic(api_key=get_api_key())
    user_message = build_user_message(bundle)

    messages: list[dict] = [{"role": "user", "content": user_message}]

    for _ in range(MAX_CONTINUATIONS):
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
            tool_choice={"type": "auto"},
            messages=messages,
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "record_profile":
                profile_data = block.input
                profile_data["model"] = MODEL
                _persist(conn, login, profile_data)

                usage = response.usage
                return {
                    "login": login,
                    "fit_score": profile_data.get("fit_score"),
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "cache_read": getattr(usage, "cache_read_input_tokens", 0),
                    "cache_create": getattr(usage, "cache_creation_input_tokens", 0),
                }

        if response.stop_reason == "pause_turn":
            messages = [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": response.content},
            ]
            continue

        if response.stop_reason == "end_turn":
            break

        break

    return None


def _persist(conn: psycopg.Connection, login: str, data: dict) -> None:
    db.upsert_profile(conn, login, data)
    db.insert_signals(conn, login, data.get("signals", []))
    db.insert_skills(conn, login, data.get("skills", []))
    db.ensure_crm(conn, login)
    conn.commit()
```

- [ ] **Step 4: Delete old files**

```bash
rm pipeline/src/scout/web_enrich.py pipeline/src/scout/web_search.py
```

- [ ] **Step 5: Update `pipeline/src/scout/github.py`**

Update the caching to use Redis instead of JSON files. Replace the `_cache_path`, `_read_cache`, `_write_cache` functions with calls to `cache.py`:

Replace the top of `github.py`:

```python
import json
import subprocess
from typing import Any

from scout.cache import cache_get, cache_set
```

Then replace `_cache_path`, `_read_cache`, `_write_cache` functions and update `gh_api` to use `cache_get`/`cache_set` with namespace `"gh"` and TTL 3600.

- [ ] **Step 6: Simplify `deep_dive.py`**

Replace with a thin wrapper that calls `enrich_candidate`:

```python
import asyncio
from scout.enrich import enrich_candidate


async def run_deep_dive(login: str) -> str:
    result = enrich_candidate(login)
    return f"Enriched {login}: {result['tool_calls']} tool calls in {result['duration_ms']/1000:.1f}s"
```

- [ ] **Step 7: Verify CLI loads**

Run: `cd pipeline && uv run scout --help`
Expected: Shows 6 commands (no `web-enrich`).

- [ ] **Step 8: Commit**

```bash
git add pipeline/src/scout/
git rm pipeline/src/scout/web_enrich.py pipeline/src/scout/web_search.py
git commit -m "feat: agent-driven pipeline — remove web-enrich, update CLI and orchestrator"
```

---

## Task 9: Web Enrichment Trigger

**Files:**
- Create: `web/src/app/api/enrich/[login]/route.ts`
- Modify: `web/src/app/candidates/[login]/actions.ts`
- Create: `web/src/components/enrich-button.tsx`
- Modify: `web/src/app/candidates/[login]/page.tsx`

- [ ] **Step 1: Create `web/src/app/api/enrich/[login]/route.ts`**

API route that triggers enrichment via subprocess and returns status:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { login } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  exec(
    `cd ${process.cwd()}/../pipeline && uv run scout deep-dive ${login}`,
    { env: { ...process.env } },
    (error, stdout, stderr) => {
      if (error) console.error(`Enrich error for ${login}:`, stderr);
      else console.log(`Enrich done for ${login}:`, stdout);
    }
  );

  return NextResponse.json({ status: "started", login });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const [logCount, repoCount, profileCount, linkedInCount, webCount] = await Promise.all([
    prisma.enrichmentLog.count({ where: { candidateLogin: login } }),
    prisma.repo.count({ where: { candidateLogin: login } }),
    prisma.profile.count({ where: { candidateLogin: login } }),
    prisma.linkedInProfile.count({ where: { candidateLogin: login } }),
    prisma.webMention.count({ where: { candidateLogin: login } }),
  ]);

  const recentLogs = await prisma.enrichmentLog.findMany({
    where: { candidateLogin: login },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { tool: true, error: true, durationMs: true, createdAt: true },
  });

  return NextResponse.json({
    login,
    enriched: repoCount > 0,
    analyzed: profileCount > 0,
    hasLinkedIn: linkedInCount > 0,
    webMentions: webCount,
    toolCalls: logCount,
    recentLogs,
  });
}
```

- [ ] **Step 2: Create `web/src/components/enrich-button.tsx`**

Client component that triggers enrichment and polls for progress:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type LogEntry = { tool: string; error: string | null; durationMs: number | null; createdAt: string };

export function EnrichButton({ login }: { login: string }) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toolCalls, setToolCalls] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const router = useRouter();

  const trigger = async () => {
    setStatus("running");
    setLogs([]);
    await fetch(`/api/enrich/${login}`, { method: "POST" });

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/enrich/${login}`);
      const data = await res.json();
      setToolCalls(data.toolCalls);
      setLogs(data.recentLogs);
    }, 2000);

    setTimeout(() => {
      clearInterval(pollRef.current);
      setStatus("done");
      router.refresh();
    }, 120000);
  };

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <div>
      {status === "idle" && (
        <button className="tb-link" onClick={trigger} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          ▸ Enrich with agent
        </button>
      )}
      {status === "running" && (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: "var(--color-accent)", fontWeight: 600, marginBottom: 6 }}>
            Enriching... ({toolCalls} tool calls)
          </div>
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {logs.map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: l.error ? "#dc2626" : "var(--color-fg-muted)", padding: "1px 0" }}>
                {l.tool} {l.durationMs ? `(${l.durationMs}ms)` : ""} {l.error ? `— ${l.error}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ fontSize: 12, color: "#16a34a" }}>
          ✓ Enrichment complete ({toolCalls} tool calls)
          <button className="tb-link" onClick={() => { setStatus("idle"); router.refresh(); }} style={{ marginLeft: 8 }}>
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add EnrichButton to the detail page**

In `web/src/app/candidates/[login]/page.tsx`, import and add the button in the CRM aside area, above the CrmPanel:

```tsx
import { EnrichButton } from "@/components/enrich-button";
```

Add inside the `<aside>` before `<CrmPanel>`:

```tsx
<aside className="detail-aside">
  <div style={{ padding: "12px 20px 0", borderBottom: "1px solid var(--color-border)", paddingBottom: 12, marginBottom: 0 }}>
    <h3 style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-fg-subtle)", margin: "0 0 8px" }}>Agent</h3>
    <EnrichButton login={login} />
  </div>
  <CrmPanel ... />
</aside>
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: web-triggered enrichment with live progress polling"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] **1. Infrastructure:** `docker compose ps` shows both services healthy
- [ ] **2. DB tables:** `psql postgresql://scout:scout_dev@localhost:54320/scout -c "\dt"` shows all 14 tables (12 existing + EnrichmentLog + AgentMemory)
- [ ] **3. Web build:** `cd web && npm run build` succeeds
- [ ] **4. Fetch forks:** `mise run fetch-forks` ingests ~899 candidates into Postgres
- [ ] **5. Agent enrich:** `mise run enrich -- --limit 2` runs agent sessions with detailed logging — each candidate shows gh_query, web_search, web_scrape, linkedin_lookup calls with timing
- [ ] **6. Provenance:** `psql ... -c 'SELECT tool, count(*) FROM "EnrichmentLog" GROUP BY tool'` shows tool call counts
- [ ] **7. Redis cache:** `redis-cli -p 63790 keys 'scout:*' | wc -l` shows cached entries
- [ ] **8. Analyze:** `mise run analyze -- --limit 2` produces Profile rows
- [ ] **9. Web UI:** `mise run dev` → localhost:3000 shows candidates, detail page has "Enrich with agent" button
- [ ] **10. Web trigger:** Click "Enrich with agent" on a candidate → shows live tool call progress, data appears after refresh
- [ ] **11. Stats:** `mise run stats` shows tool call counts and Redis cache stats
