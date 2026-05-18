# Talent Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monorepo with a Python pipeline that crawls GitHub forkers, enriches with GitHub + LinkedIn + web data, generates Claude-powered engineering profiles, and a Next.js CRM web app for browsing/triaging — all sharing a single SQLite database.

**Architecture:** Monorepo with `pipeline/` (Python, uv) and `web/` (Next.js 16, Prisma 7). Prisma owns the schema and creates `data/scout.db`. Python reads/writes the same file via `sqlite3` stdlib. Pipeline ingests forkers of `willchen96/mike`, enriches via GitHub API + Stagehand (LinkedIn) + Firecrawl (web search), then analyzes with Claude Opus 4.7 (prompt caching, forced tool use, server-side web_search/web_fetch). Web app provides list/filter/detail/CRM UI.

**Tech Stack:**
- Python 3.11+, uv, Typer 0.25.1, Rich 15.0.0, Anthropic SDK 0.102.0, Claude Agent SDK 0.2.82, Tenacity 9.1.4, Stagehand 3.19.5+, Firecrawl-py latest, Pydantic 2.x
- Next.js 16.2.6, React 19.2.6, TypeScript 6.0.3, Prisma 7.8.0 (SQLite via @prisma/adapter-better-sqlite3 12.10.0), Tailwind CSS 4.3.0, shadcn/ui, Lucide React 1.16.0

**UI Note:** Tasks 17-19 create placeholder UI components. These will be **replaced** when the UI design arrives. All data plumbing (Prisma queries, server actions, filter helpers) is built to spec regardless.

---

## File Map

```
mikeoss-talent-scout/
├── .gitignore
├── README.md
├── data/scout.db                          (created by Prisma migration)
├── pipeline/
│   ├── pyproject.toml
│   └── src/scout/
│       ├── __init__.py
│       ├── config.py                      (env vars, paths, constants)
│       ├── db.py                          (sqlite3 upsert helpers — all tables)
│       ├── github.py                      (gh CLI wrappers + cache)
│       ├── enrich.py                      (GitHub enrichment per candidate)
│       ├── linkedin.py                    (Stagehand LinkedIn scraper)
│       ├── web_search.py                  (Firecrawl search + scrape)
│       ├── web_enrich.py                  (orchestrates linkedin + web_search)
│       ├── prompts.py                     (system prompt, tool schema, message builder)
│       ├── analyze.py                     (Claude call with agentic loop)
│       ├── pipeline.py                    (orchestrator: fetch→enrich→web-enrich→analyze)
│       ├── cli.py                         (Typer entrypoint — 7 commands)
│       └── deep_dive.py                   (Claude Agent SDK variant)
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── postcss.config.mjs
    ├── prisma.config.ts
    ├── .env
    ├── prisma/schema.prisma               (canonical schema — 10 models)
    ├── generated/prisma/                   (Prisma client output)
    └── src/
        ├── app/
        │   ├── globals.css
        │   ├── layout.tsx
        │   ├── page.tsx                   (list view)
        │   └── candidates/[login]/
        │       ├── page.tsx               (detail view)
        │       └── actions.ts             (server actions for CRM)
        ├── lib/
        │   ├── prisma.ts                  (singleton with driver adapter)
        │   ├── filters.ts                 (searchParams → Prisma where)
        │   └── utils.ts                   (cn helper)
        └── components/
            ├── ui/                        (shadcn primitives)
            ├── status-pill.tsx
            ├── filter-bar.tsx
            ├── candidate-row.tsx
            ├── signal-list.tsx
            ├── repo-card.tsx
            └── crm-panel.tsx
```

---

## Task 1: Root Scaffolding

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/
dist/

# Node / Next.js
node_modules/
.next/
generated/

# Data + cache
data/
pipeline/.cache/

# Env / secrets
mise.local.toml
.env
.env.local

# OS
.DS_Store
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Talent Scout

GitHub fork profiler + CRM for [willchen96/mike](https://github.com/willchen96/mike).

## Setup

### Prerequisites
- Python 3.11+ with [uv](https://docs.astral.sh/uv/)
- Node.js 20.19+
- `gh` CLI authenticated (`gh auth login`)
- Environment variables in `mise.local.toml` or exported:
  - `ANTHROPIC_API_KEY` (required)
  - `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` (for LinkedIn scraping)
  - `FIRECRAWL_API_KEY` (for web search/scraping)

### Database (Prisma — run first)
```bash
cd web && npm install && npx prisma migrate dev --name init
```

### Pipeline
```bash
cd pipeline && uv sync
uv run scout fetch-forks
uv run scout enrich --limit 5
uv run scout web-enrich --limit 3
uv run scout analyze --limit 5
uv run scout stats
```

### Web App
```bash
cd web && npm run dev
# open http://localhost:3000
```

## Commands

| Command | Description |
|---|---|
| `uv run scout fetch-forks` | Paginate forkers into Candidate + ForkMeta rows |
| `uv run scout enrich [--limit N]` | GitHub profile, repos, events |
| `uv run scout web-enrich [--limit N]` | LinkedIn + web presence (Stagehand + Firecrawl) |
| `uv run scout analyze [--limit N]` | Claude Opus 4.7 analysis (with live web tools) |
| `uv run scout run` | Full pipeline: fetch → enrich → web-enrich → analyze |
| `uv run scout deep-dive <login>` | Agent SDK deep-dive on one user |
| `uv run scout stats` | Print counts by status |
```

- [ ] **Step 3: Commit**

```bash
git init
git add .gitignore README.md
git commit -m "chore: root scaffolding"
```

---

## Task 2: Pipeline Project Setup

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/src/scout/__init__.py`

- [ ] **Step 1: Create `pipeline/pyproject.toml`**

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
]

[project.scripts]
scout = "scout.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/scout"]
```

- [ ] **Step 2: Create `pipeline/src/scout/__init__.py`**

Empty file.

- [ ] **Step 3: Verify uv sync**

Run: `cd pipeline && uv sync`
Expected: All dependencies install, `.venv/` created.

- [ ] **Step 4: Commit**

```bash
git add pipeline/
git commit -m "chore: pipeline uv project with all dependencies"
```

---

## Task 3: Web Project Setup

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/src/app/globals.css`
- Create: `web/src/app/layout.tsx`
- Create: `web/src/app/page.tsx`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "talent-scout-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "next": "^16.2.6",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "@prisma/client": "^7.8.0",
    "@prisma/adapter-better-sqlite3": "^7.8.0",
    "better-sqlite3": "^12.10.0",
    "lucide-react": "^1.16.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0",
    "class-variance-authority": "^0.7.1",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "prisma": "^7.8.0",
    "typescript": "^6.0.3",
    "tailwindcss": "^4.3.0",
    "@tailwindcss/postcss": "^4.3.0",
    "postcss": "^8.5.14",
    "@types/node": "^25.9.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/better-sqlite3": "^7.6.14"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", "generated/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `web/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Create `web/postcss.config.mjs`**

```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 5: Create `web/src/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 6: Create `web/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talent Scout",
  description: "GitHub fork profiler CRM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Create `web/src/app/page.tsx`**

```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl font-bold">Talent Scout</h1></main>;
}
```

- [ ] **Step 8: Install and verify**

Run: `cd web && npm install && npm run build`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add web/
git commit -m "chore: web project — Next.js 16, Tailwind v4, Prisma 7"
```

---

## Task 4: Prisma Schema + Migrations

**Files:**
- Create: `web/.env`
- Create: `web/prisma.config.ts`
- Create: `web/prisma/schema.prisma`

- [ ] **Step 1: Create `web/.env`**

```env
DATABASE_URL="file:../data/scout.db"
```

- [ ] **Step 2: Create `web/prisma.config.ts`**

```typescript
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

- [ ] **Step 3: Create `web/prisma/schema.prisma`**

This is the canonical schema for all 10 models — base + web enrichment.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "sqlite"
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

  forkMeta    ForkMeta?
  repos       Repo[]
  events      Event[]
  profile     Profile?
  signals     Signal[]
  skills      Skill[]
  crm         Crm?
  linkedIn    LinkedInProfile?
  webMentions WebMention[]
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
```

- [ ] **Step 4: Run migration**

Run:
```bash
mkdir -p data
cd web && npx prisma migrate dev --name init
```

Expected: `data/scout.db` created with all 10 tables.

- [ ] **Step 5: Verify tables**

Run: `sqlite3 data/scout.db ".tables"`
Expected: `Candidate Crm Event ForkMeta LinkedInProfile Profile Repo Signal Skill WebMention _prisma_migrations`

- [ ] **Step 6: Commit**

```bash
git add data/ web/prisma/ web/prisma.config.ts web/.env web/generated/
git commit -m "feat: prisma schema — 10 models with web enrichment tables"
```

---

## Task 5: Prisma Singleton + Filter Helpers

**Files:**
- Create: `web/src/lib/utils.ts`
- Create: `web/src/lib/prisma.ts`
- Create: `web/src/lib/filters.ts`

- [ ] **Step 1: Create `web/src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `web/src/lib/prisma.ts`**

```typescript
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:../data/scout.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Create `web/src/lib/filters.ts`**

```typescript
export function buildWhere(searchParams: Record<string, string | undefined>) {
  const where: Record<string, unknown> = {};
  const { status, seniority, fitMin, fitMax, hasOwnCommits, language, q } = searchParams;

  if (status) where.crm = { status };
  if (seniority) where.profile = { ...((where.profile as object) ?? {}), seniority };
  if (fitMin || fitMax) {
    where.profile = {
      ...((where.profile as object) ?? {}),
      fitScore: {
        ...(fitMin ? { gte: parseInt(fitMin) } : {}),
        ...(fitMax ? { lte: parseInt(fitMax) } : {}),
      },
    };
  }
  if (hasOwnCommits === "true") where.forkMeta = { hasOwnCommits: true };
  if (language) where.repos = { some: { language } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { bio: { contains: q } },
      { login: { contains: q } },
    ];
  }
  return where;
}

export function buildOrderBy(sort?: string) {
  switch (sort) {
    case "followers":
      return { followers: "desc" as const };
    case "publicRepos":
      return { publicRepos: "desc" as const };
    case "fetchedAt":
      return { fetchedAt: "desc" as const };
    case "fitScore":
    default:
      return { profile: { fitScore: "desc" as const } };
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/
git commit -m "feat: prisma singleton + filter helpers"
```

---

## Task 6: Pipeline config.py + db.py

**Files:**
- Create: `pipeline/src/scout/config.py`
- Create: `pipeline/src/scout/db.py`

- [ ] **Step 1: Create `pipeline/src/scout/config.py`**

```python
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "scout.db"
CACHE_DIR = PROJECT_ROOT / "pipeline" / ".cache"
FORK_REPO = "willchen96/mike"
MODEL = "claude-opus-4-7"


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return key


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

- [ ] **Step 2: Create `pipeline/src/scout/db.py`**

This includes all helpers for all 10 tables — base + web enrichment.

```python
import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


# --- Candidate ---

def upsert_candidate(conn: sqlite3.Connection, c: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO Candidate
           (login, name, bio, location, company, blog, twitter,
            hireable, followers, publicRepos, avatarUrl, htmlUrl,
            githubCreatedAt, fetchedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(login) DO UPDATE SET
             name=excluded.name, bio=excluded.bio, location=excluded.location,
             company=excluded.company, blog=excluded.blog, twitter=excluded.twitter,
             hireable=excluded.hireable, followers=excluded.followers,
             publicRepos=excluded.publicRepos, avatarUrl=excluded.avatarUrl,
             htmlUrl=excluded.htmlUrl, githubCreatedAt=excluded.githubCreatedAt,
             fetchedAt=excluded.fetchedAt
        """,
        (
            c["login"], c.get("name"), c.get("bio"), c.get("location"),
            c.get("company"), c.get("blog"), c.get("twitter"),
            c.get("hireable"), c.get("followers", 0), c.get("public_repos", 0),
            c.get("avatar_url"), c.get("html_url"),
            c.get("created_at"), datetime.utcnow().isoformat(),
        ),
    )


# --- ForkMeta ---

def upsert_fork_meta(conn: sqlite3.Connection, login: str, f: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO ForkMeta
           (candidateLogin, forkHtmlUrl, forkPushedAt, forkStars,
            aheadBy, behindBy, hasOwnCommits, defaultBranch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             forkHtmlUrl=excluded.forkHtmlUrl, forkPushedAt=excluded.forkPushedAt,
             forkStars=excluded.forkStars, aheadBy=excluded.aheadBy,
             behindBy=excluded.behindBy, hasOwnCommits=excluded.hasOwnCommits,
             defaultBranch=excluded.defaultBranch
        """,
        (
            login, f.get("html_url"), f.get("pushed_at"), f.get("stargazers_count", 0),
            f.get("ahead_by", 0), f.get("behind_by", 0),
            f.get("has_own_commits", False), f.get("default_branch"),
        ),
    )


# --- Repo ---

def insert_repos(conn: sqlite3.Connection, login: str, repos: list[dict]) -> None:
    conn.execute("DELETE FROM Repo WHERE candidateLogin = ?", (login,))
    for r in repos:
        conn.execute(
            """INSERT INTO Repo
               (candidateLogin, name, htmlUrl, description, language, stars, forks, pushedAt, isFork)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (login, r["name"], r["html_url"], r.get("description"),
             r.get("language"), r.get("stargazers_count", 0),
             r.get("forks_count", 0), r.get("pushed_at"), r.get("fork", False)),
        )


# --- Event ---

def insert_events(conn: sqlite3.Connection, login: str, events: list[dict]) -> None:
    conn.execute("DELETE FROM Event WHERE candidateLogin = ?", (login,))
    for e in events:
        conn.execute(
            "INSERT INTO Event (candidateLogin, type, repoName, createdAt, payload) VALUES (?, ?, ?, ?, ?)",
            (login, e["type"], e.get("repo", {}).get("name"),
             e["created_at"], json.dumps(e.get("payload", {}))[:2000]),
        )


# --- Profile ---

def upsert_profile(conn: sqlite3.Connection, login: str, p: dict[str, Any], prompt_version: int = 1) -> None:
    conn.execute(
        """INSERT INTO Profile
           (candidateLogin, summary, seniority, fitScore, fitReasoning,
            recommendedOutreach, outreachReason, confidence, model,
            promptVersion, generatedAt, rawJson)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             summary=excluded.summary, seniority=excluded.seniority,
             fitScore=excluded.fitScore, fitReasoning=excluded.fitReasoning,
             recommendedOutreach=excluded.recommendedOutreach,
             outreachReason=excluded.outreachReason,
             confidence=excluded.confidence, model=excluded.model,
             promptVersion=excluded.promptVersion,
             generatedAt=excluded.generatedAt, rawJson=excluded.rawJson
        """,
        (login, p.get("summary"), p.get("seniority"), p.get("fit_score"),
         p.get("fit_reasoning"), p.get("recommended_outreach"),
         p.get("outreach_reason"), p.get("confidence"),
         p.get("model"), prompt_version,
         datetime.utcnow().isoformat(), json.dumps(p)),
    )


# --- Signal / Skill ---

def insert_signals(conn: sqlite3.Connection, login: str, signals: list[dict]) -> None:
    conn.execute("DELETE FROM Signal WHERE candidateLogin = ?", (login,))
    for s in signals:
        conn.execute("INSERT INTO Signal (candidateLogin, kind, text) VALUES (?, ?, ?)",
                     (login, s["kind"], s["text"]))


def insert_skills(conn: sqlite3.Connection, login: str, skills: list[str]) -> None:
    conn.execute("DELETE FROM Skill WHERE candidateLogin = ?", (login,))
    for name in skills:
        conn.execute("INSERT INTO Skill (candidateLogin, name) VALUES (?, ?)", (login, name))


# --- Crm ---

def ensure_crm(conn: sqlite3.Connection, login: str) -> None:
    conn.execute(
        "INSERT INTO Crm (candidateLogin, status, updatedAt) VALUES (?, 'new', ?) ON CONFLICT(candidateLogin) DO NOTHING",
        (login, datetime.utcnow().isoformat()),
    )


# --- LinkedInProfile ---

def upsert_linkedin_profile(conn: sqlite3.Connection, login: str, data: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO LinkedInProfile
           (candidateLogin, profileUrl, headline, currentTitle, currentCompany,
            location, connectionCount, experience, education, skills, certifications, scrapedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             profileUrl=excluded.profileUrl, headline=excluded.headline,
             currentTitle=excluded.currentTitle, currentCompany=excluded.currentCompany,
             location=excluded.location, connectionCount=excluded.connectionCount,
             experience=excluded.experience, education=excluded.education,
             skills=excluded.skills, certifications=excluded.certifications,
             scrapedAt=excluded.scrapedAt
        """,
        (login, data.get("profile_url"), data.get("headline"),
         data.get("current_title"), data.get("current_company"),
         data.get("location"), data.get("connection_count"),
         json.dumps(data.get("experience", [])),
         json.dumps(data.get("education", [])),
         json.dumps(data.get("skills", [])),
         json.dumps(data.get("certifications", [])),
         datetime.utcnow().isoformat()),
    )


# --- WebMention ---

def insert_web_mentions(conn: sqlite3.Connection, login: str, mentions: list[dict]) -> None:
    conn.execute("DELETE FROM WebMention WHERE candidateLogin = ?", (login,))
    for m in mentions:
        conn.execute(
            """INSERT INTO WebMention (candidateLogin, url, title, snippet, source, content, scrapedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (login, m["url"], m.get("title"), m.get("snippet"),
             m.get("source", "google"), (m.get("content") or "")[:5000],
             datetime.utcnow().isoformat()),
        )


# --- Queries ---

def get_unenriched_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = "SELECT login FROM Candidate WHERE login NOT IN (SELECT candidateLogin FROM Repo) ORDER BY login"
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unweb_enriched_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM Candidate
             WHERE login IN (SELECT candidateLogin FROM Repo)
             AND login NOT IN (SELECT candidateLogin FROM LinkedInProfile)
             AND login NOT IN (SELECT DISTINCT candidateLogin FROM WebMention)
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unanalyzed_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM Candidate
             WHERE login NOT IN (SELECT candidateLogin FROM Profile)
             AND login IN (SELECT candidateLogin FROM Repo)
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_candidate_bundle(conn: sqlite3.Connection, login: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM Candidate WHERE login = ?", (login,)).fetchone()
    if not row:
        return None
    c = dict(row)
    c["repos"] = [dict(r) for r in conn.execute(
        "SELECT * FROM Repo WHERE candidateLogin = ? ORDER BY stars DESC LIMIT 10", (login,)).fetchall()]
    c["events"] = [dict(e) for e in conn.execute(
        "SELECT * FROM Event WHERE candidateLogin = ? ORDER BY createdAt DESC LIMIT 30", (login,)).fetchall()]
    fork = conn.execute("SELECT * FROM ForkMeta WHERE candidateLogin = ?", (login,)).fetchone()
    c["fork_meta"] = dict(fork) if fork else None
    li = conn.execute("SELECT * FROM LinkedInProfile WHERE candidateLogin = ?", (login,)).fetchone()
    c["linkedin"] = dict(li) if li else None
    c["web_mentions"] = [dict(w) for w in conn.execute(
        "SELECT * FROM WebMention WHERE candidateLogin = ? ORDER BY scrapedAt DESC", (login,)).fetchall()]
    return c


def get_stats(conn: sqlite3.Connection) -> dict[str, int]:
    def count(sql: str) -> int:
        return conn.execute(sql).fetchone()[0]
    return {
        "candidates": count("SELECT COUNT(*) FROM Candidate"),
        "enriched": count("SELECT COUNT(DISTINCT candidateLogin) FROM Repo"),
        "web_enriched": count("SELECT COUNT(DISTINCT candidateLogin) FROM LinkedInProfile"),
        "analyzed": count("SELECT COUNT(*) FROM Profile"),
        "new": count("SELECT COUNT(*) FROM Crm WHERE status = 'new'"),
        "reviewing": count("SELECT COUNT(*) FROM Crm WHERE status = 'reviewing'"),
        "interested": count("SELECT COUNT(*) FROM Crm WHERE status = 'interested'"),
        "contacted": count("SELECT COUNT(*) FROM Crm WHERE status = 'contacted'"),
        "passed": count("SELECT COUNT(*) FROM Crm WHERE status = 'passed'"),
        "hired": count("SELECT COUNT(*) FROM Crm WHERE status = 'hired'"),
    }
```

- [ ] **Step 3: Verify imports**

Run: `cd pipeline && uv run python -c "from scout.config import DB_PATH; from scout.db import connect; print(DB_PATH)"`
Expected: Prints path to `data/scout.db`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/scout/config.py pipeline/src/scout/db.py
git commit -m "feat: config + db helpers for all 10 tables"
```

---

## Task 7: Pipeline github.py

**Files:**
- Create: `pipeline/src/scout/github.py`

- [ ] **Step 1: Create `pipeline/src/scout/github.py`**

Same as draft plan — `gh_api()` with pagination, caching, and convenience wrappers (`fetch_forks`, `fetch_user`, `fetch_user_repos`, `fetch_user_events`, `fetch_compare`). See the draft plan Task 7 for complete code — it is unchanged.

```python
import json
import subprocess
from pathlib import Path
from typing import Any

from scout.config import CACHE_DIR


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "__").replace("?", "_q_").replace("&", "_a_")
    return CACHE_DIR / f"{safe}.json"


def _read_cache(key: str) -> Any | None:
    p = _cache_path(key)
    if p.exists():
        return json.loads(p.read_text())
    return None


def _write_cache(key: str, data: Any) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(key).write_text(json.dumps(data))


def gh_api(endpoint: str, paginate: bool = False, use_cache: bool = True) -> Any:
    cache_key = f"{'pag_' if paginate else ''}{endpoint}"
    if use_cache:
        cached = _read_cache(cache_key)
        if cached is not None:
            return cached

    cmd = ["gh", "api", endpoint, "--header", "Accept: application/vnd.github+json"]
    if paginate:
        cmd.append("--paginate")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"gh api failed: {result.stderr.strip()}")

    text = result.stdout.strip()
    if paginate:
        data = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            parsed = json.loads(line)
            if isinstance(parsed, list):
                data.extend(parsed)
            else:
                data.append(parsed)
    else:
        data = json.loads(text)

    if use_cache:
        _write_cache(cache_key, data)
    return data


def fetch_forks(repo: str) -> list[dict]:
    return gh_api(f"repos/{repo}/forks?sort=newest&per_page=100", paginate=True)


def fetch_user(login: str) -> dict:
    return gh_api(f"users/{login}")


def fetch_user_repos(login: str, limit: int = 10) -> list[dict]:
    repos = gh_api(f"users/{login}/repos?sort=updated&per_page=30")
    repos.sort(key=lambda r: r.get("stargazers_count", 0), reverse=True)
    return repos[:limit]


def fetch_user_events(login: str) -> list[dict]:
    return gh_api(f"users/{login}/events/public?per_page=30")


def fetch_compare(owner: str, repo: str, base: str, head: str) -> dict | None:
    try:
        return gh_api(f"repos/{owner}/{repo}/compare/{base}...{head}", use_cache=True)
    except RuntimeError:
        return None
```

- [ ] **Step 2: Verify**

Run: `cd pipeline && uv run python -c "from scout.github import gh_api; print(type(gh_api('users/octocat')))"`
Expected: `<class 'dict'>`

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/scout/github.py
git commit -m "feat: github.py — gh CLI wrappers with pagination and caching"
```

---

## Task 8: Pipeline enrich.py

**Files:**
- Create: `pipeline/src/scout/enrich.py`

- [ ] **Step 1: Create `pipeline/src/scout/enrich.py`**

Unchanged from draft plan. Enriches one candidate with GitHub profile, repos, events, and fork comparison.

```python
import sqlite3
from typing import Any

from scout import github, db
from scout.config import FORK_REPO


def enrich_candidate(conn: sqlite3.Connection, login: str) -> None:
    user = github.fetch_user(login)
    db.upsert_candidate(conn, user)

    repos = github.fetch_user_repos(login)
    db.insert_repos(conn, login, repos)

    events = github.fetch_user_events(login)
    db.insert_events(conn, login, events)

    fork_meta = _build_fork_meta(login)
    if fork_meta:
        db.upsert_fork_meta(conn, login, fork_meta)

    db.ensure_crm(conn, login)
    conn.commit()


def _build_fork_meta(login: str) -> dict[str, Any] | None:
    compare = github.fetch_compare(
        FORK_REPO.split("/")[0],
        FORK_REPO.split("/")[1],
        "main",
        f"{login}:main",
    )
    if not compare:
        return None
    return {
        "ahead_by": compare.get("ahead_by", 0),
        "behind_by": compare.get("behind_by", 0),
        "has_own_commits": compare.get("ahead_by", 0) > 0,
    }
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/enrich.py
git commit -m "feat: enrich.py — per-candidate GitHub enrichment"
```

---

## Task 9: Pipeline prompts.py

**Files:**
- Create: `pipeline/src/scout/prompts.py`

- [ ] **Step 1: Create `pipeline/src/scout/prompts.py`**

Includes LinkedIn + web data sections in `build_user_message()` and updated system prompt referencing web tools.

```python
import json


SYSTEM_PROMPT = """You are a senior engineering recruiter at an AI-first legal technology company. You are evaluating GitHub profiles of developers who forked an open-source AI legal platform (TypeScript/Python stack).

Your job is to produce a structured assessment of each developer. Be thorough and balanced:
- Look for genuine engineering signals: own projects, contribution patterns, code quality indicators
- Identify relevant skills: TypeScript, Python, AI/ML, legal-tech, full-stack, DevOps
- Note red flags honestly: drive-by forks with no activity, abandoned profiles, sparse contribution history
- Assess fit for a legal-AI engineering role specifically

You may also receive LinkedIn profile data and web mentions (blog posts, conference talks, personal sites). Use this to build a more complete picture:
- LinkedIn experience and skills complement GitHub activity
- Blog posts and talks indicate thought leadership
- Conference appearances suggest community involvement
- Gaps between LinkedIn and GitHub (e.g., claims senior role but sparse GitHub) are worth noting

You also have access to web_search and web_fetch tools. If the provided data leaves gaps that a quick search could fill, use them — but don't search for every candidate. Use them when something seems promising but incomplete.

Rate fit on a 1-5 scale:
1 = No relevant signal (empty profile, drive-by fork)
2 = Minimal signal (few repos, no relevant tech)
3 = Some relevant experience but unclear fit
4 = Strong relevant experience
5 = Exceptional fit (deep AI + legal/compliance + TypeScript/Python)

You MUST call the record_profile tool with your assessment."""

TOOL_SCHEMA = {
    "name": "record_profile",
    "description": "Record the structured profile assessment for a candidate",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "2-3 sentence summary of the developer's profile and relevance",
            },
            "seniority": {
                "type": "string",
                "enum": ["junior", "mid", "senior", "staff", "unknown"],
            },
            "fit_score": {
                "type": "integer",
                "enum": [1, 2, 3, 4, 5],
            },
            "fit_reasoning": {"type": "string"},
            "recommended_outreach": {
                "type": "string",
                "enum": ["yes", "no", "maybe"],
            },
            "outreach_reason": {"type": "string"},
            "confidence": {"type": "number"},
            "signals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["positive", "negative", "notable"]},
                        "text": {"type": "string"},
                    },
                    "required": ["kind", "text"],
                },
            },
            "skills": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "summary", "seniority", "fit_score", "fit_reasoning",
            "recommended_outreach", "outreach_reason", "confidence",
            "signals", "skills",
        ],
    },
}


def build_user_message(bundle: dict) -> str:
    parts = []

    # GitHub profile
    parts.append(f"## GitHub Profile: {bundle['login']}")
    for field in ["name", "bio", "location", "company", "blog", "twitter", "hireable"]:
        val = bundle.get(field)
        if val:
            parts.append(f"- **{field}**: {val}")
    parts.append(f"- **Followers**: {bundle.get('followers', 0)}")
    parts.append(f"- **Public repos**: {bundle.get('publicRepos', 0)}")
    parts.append(f"- **GitHub since**: {bundle.get('githubCreatedAt', 'unknown')}")

    # Fork meta
    fm = bundle.get("fork_meta")
    if fm:
        parts.append(f"\n## Fork of willchen96/mike")
        parts.append(f"- Ahead by: {fm.get('aheadBy', 0)} commits")
        parts.append(f"- Behind by: {fm.get('behindBy', 0)} commits")
        parts.append(f"- Has own commits: {fm.get('hasOwnCommits', False)}")

    # Top repos
    repos = bundle.get("repos", [])
    if repos:
        parts.append(f"\n## Top Repos ({len(repos)})")
        for r in repos:
            lang = r.get("language") or "unknown"
            desc = (r.get("description") or "")[:100]
            fork_tag = " [fork]" if r.get("isFork") else ""
            parts.append(f"- **{r['name']}** ({lang}, {r.get('stars', 0)} stars){fork_tag}: {desc}")

    # Recent activity
    events = bundle.get("events", [])
    if events:
        types: dict[str, int] = {}
        for e in events:
            types[e["type"]] = types.get(e["type"], 0) + 1
        parts.append(f"\n## Recent Activity ({len(events)} events)")
        for t, count in sorted(types.items(), key=lambda x: -x[1]):
            parts.append(f"- {t}: {count}")

    # Language distribution
    lang_counts: dict[str, int] = {}
    for r in repos:
        lang = r.get("language")
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
    if lang_counts:
        parts.append("\n## Language Distribution")
        for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
            parts.append(f"- {lang}: {count} repos")

    # LinkedIn profile
    li = bundle.get("linkedin")
    if li:
        parts.append("\n## LinkedIn Profile")
        if li.get("headline"):
            parts.append(f"- **Headline**: {li['headline']}")
        if li.get("currentTitle"):
            parts.append(f"- **Current Role**: {li['currentTitle']} at {li.get('currentCompany', 'unknown')}")
        if li.get("location"):
            parts.append(f"- **Location**: {li['location']}")
        exp = li.get("experience")
        if exp:
            exp_list = json.loads(exp) if isinstance(exp, str) else exp
            for role in exp_list[:5]:
                dur = f" ({role.get('duration', '')})" if role.get("duration") else ""
                parts.append(f"- {role.get('title', '?')} at {role.get('company', '?')}{dur}")
        edu = li.get("education")
        if edu:
            edu_list = json.loads(edu) if isinstance(edu, str) else edu
            for school in edu_list[:3]:
                parts.append(f"- Education: {school.get('degree', '')} {school.get('field', '')} — {school.get('school', '')}")
        skills_raw = li.get("skills")
        if skills_raw:
            skill_list = json.loads(skills_raw) if isinstance(skills_raw, str) else skills_raw
            if skill_list:
                parts.append(f"- **LinkedIn Skills**: {', '.join(skill_list[:15])}")

    # Web mentions
    mentions = bundle.get("web_mentions", [])
    if mentions:
        parts.append(f"\n## Web Presence ({len(mentions)} mentions found)")
        for m in mentions[:8]:
            title = m.get("title") or m.get("url", "")
            source = m.get("source", "web")
            snippet = (m.get("snippet") or "")[:200]
            content_preview = (m.get("content") or "")[:300]
            parts.append(f"- [{source}] {title}")
            if snippet:
                parts.append(f"  > {snippet}")
            elif content_preview:
                parts.append(f"  > {content_preview}")

    return "\n".join(parts)
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/prompts.py
git commit -m "feat: prompts.py — system prompt, tool schema, message builder with LinkedIn/web"
```

---

## Task 10: Pipeline analyze.py

**Files:**
- Create: `pipeline/src/scout/analyze.py`

- [ ] **Step 1: Create `pipeline/src/scout/analyze.py`**

Includes agentic loop for server-side web_search/web_fetch tools + client-side record_profile tool.

```python
import json
import sqlite3
import anthropic

from scout.config import MODEL, get_api_key
from scout.prompts import SYSTEM_PROMPT, TOOL_SCHEMA, build_user_message
from scout import db


MAX_CONTINUATIONS = 5


def analyze_candidate(conn: sqlite3.Connection, bundle: dict) -> dict | None:
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

        # Check for our client-side tool (record_profile)
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

        # Server-side tools (web_search, web_fetch) — results already in response.content
        # If pause_turn, re-send to continue the server-side loop
        if response.stop_reason == "pause_turn":
            messages = [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": response.content},
            ]
            continue

        # end_turn without record_profile — Claude chose not to use the tool
        if response.stop_reason == "end_turn":
            break

        # tool_use but not record_profile — shouldn't happen with auto, but handle
        break

    return None


def _persist(conn: sqlite3.Connection, login: str, data: dict) -> None:
    db.upsert_profile(conn, login, data)
    db.insert_signals(conn, login, data.get("signals", []))
    db.insert_skills(conn, login, data.get("skills", []))
    db.ensure_crm(conn, login)
    conn.commit()
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/analyze.py
git commit -m "feat: analyze.py — Claude Opus 4.7 with agentic loop and server-side web tools"
```

---

## Task 11: Pipeline linkedin.py

**Files:**
- Create: `pipeline/src/scout/linkedin.py`

- [ ] **Step 1: Create `pipeline/src/scout/linkedin.py`**

```python
import asyncio
import os
from typing import Any

from pydantic import BaseModel
from rich.console import Console
from stagehand import AsyncStagehand

from scout.config import get_browserbase_keys, get_api_key

console = Console()


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


async def scrape_linkedin(name: str | None, company: str | None, login: str) -> dict[str, Any] | None:
    bb_key, bb_project = get_browserbase_keys()
    model_key = get_api_key()

    search_terms = []
    if name:
        search_terms.append(f'"{name}"')
    if company:
        search_terms.append(f'"{company}"')
    if not search_terms:
        search_terms.append(login)
    search_query = " ".join(search_terms) + " site:linkedin.com/in"

    try:
        async with AsyncStagehand(
            server="remote",
            browserbase_api_key=bb_key,
            browserbase_project_id=bb_project,
            model_api_key=model_key,
        ) as client:
            session = await client.sessions.start(
                model_name="anthropic/claude-sonnet-4-6",
                browser={"type": "browserbase"},
            )

            try:
                # Agent searches Google and navigates to LinkedIn
                await session.execute(
                    execute_options={
                        "instruction": (
                            f"Go to google.com and search for: {search_query}\n"
                            f"Click on the first LinkedIn profile result (linkedin.com/in/...).\n"
                            f"Wait for the profile page to fully load."
                        ),
                        "max_steps": 8,
                    },
                    agent_config={"model": "anthropic/claude-sonnet-4-6"},
                    timeout=60.0,
                )

                # Extract structured profile data
                result = await session.extract(
                    instruction=(
                        "Extract the LinkedIn profile data: headline, current job title and company, "
                        "location, work experience (title, company, duration for each role), "
                        "education (school, degree, field), and listed skills. "
                        "Also extract the profile URL from the browser address bar."
                    ),
                    schema=LinkedInProfileData,
                )

                profile = result.data.result
                if profile and isinstance(profile, LinkedInProfileData):
                    return {
                        "profile_url": profile.profile_url,
                        "headline": profile.headline,
                        "current_title": profile.current_title,
                        "current_company": profile.current_company,
                        "location": profile.location,
                        "experience": [e.model_dump() for e in profile.experience],
                        "education": [e.model_dump() for e in profile.education],
                        "skills": profile.skills,
                        "certifications": profile.certifications,
                    }
            finally:
                await session.end()

    except Exception as e:
        console.print(f"  [yellow]LinkedIn scrape failed for {login}: {e}[/yellow]")

    return None
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/linkedin.py
git commit -m "feat: linkedin.py — Stagehand LinkedIn profile scraper"
```

---

## Task 12: Pipeline web_search.py

**Files:**
- Create: `pipeline/src/scout/web_search.py`

- [ ] **Step 1: Create `pipeline/src/scout/web_search.py`**

```python
from typing import Any

from firecrawl import FirecrawlApp
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from scout.config import get_firecrawl_key

console = Console()


class FirecrawlRetryable(Exception):
    pass


@retry(
    retry=retry_if_exception_type(FirecrawlRetryable),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
)
def _search(app: FirecrawlApp, query: str, limit: int = 10) -> list[dict]:
    try:
        results = app.search(query, params={"limit": limit})
        if isinstance(results, list):
            return results
        if isinstance(results, dict) and "data" in results:
            return results["data"]
        return []
    except Exception as e:
        if "429" in str(e) or "rate" in str(e).lower():
            raise FirecrawlRetryable(str(e)) from e
        raise


@retry(
    retry=retry_if_exception_type(FirecrawlRetryable),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
)
def _scrape(app: FirecrawlApp, url: str) -> dict | None:
    try:
        result = app.scrape_url(url, params={"formats": ["markdown"]})
        if isinstance(result, dict):
            return result
        return None
    except Exception as e:
        if "429" in str(e) or "rate" in str(e).lower():
            raise FirecrawlRetryable(str(e)) from e
        console.print(f"  [yellow]Scrape failed for {url}: {e}[/yellow]")
        return None


def search_and_scrape(
    name: str | None, login: str, limit: int = 5
) -> list[dict[str, Any]]:
    app = FirecrawlApp(api_key=get_firecrawl_key())

    query_parts = []
    if name:
        query_parts.append(f'"{name}"')
    query_parts.append(login)
    query_parts.append("developer")
    query = " ".join(query_parts)

    results = _search(app, query, limit=limit * 2)

    mentions = []
    for r in results:
        url = r.get("url", "")
        if not url or "github.com" in url:
            continue
        if len(mentions) >= limit:
            break

        title = r.get("title") or r.get("metadata", {}).get("title", "")
        snippet = r.get("description") or r.get("metadata", {}).get("description", "")

        content = r.get("markdown", "")
        if not content:
            scraped = _scrape(app, url)
            if scraped:
                content = scraped.get("markdown", "")

        if len(content) < 100:
            continue

        source = "google"
        url_lower = url.lower()
        if "blog" in url_lower or "medium.com" in url_lower or "dev.to" in url_lower:
            source = "blog"
        elif "conference" in url_lower or "speaker" in url_lower or "talk" in url_lower:
            source = "conference"

        mentions.append({
            "url": url,
            "title": title[:200],
            "snippet": snippet[:300],
            "source": source,
            "content": content[:5000],
        })

    return mentions
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/web_search.py
git commit -m "feat: web_search.py — Firecrawl search + scrape"
```

---

## Task 13: Pipeline web_enrich.py

**Files:**
- Create: `pipeline/src/scout/web_enrich.py`

- [ ] **Step 1: Create `pipeline/src/scout/web_enrich.py`**

```python
import asyncio
import sqlite3
import time

from rich.console import Console

from scout import db
from scout.linkedin import scrape_linkedin
from scout.web_search import search_and_scrape

console = Console()

LINKEDIN_DELAY_SECONDS = 5


def web_enrich_candidate(conn: sqlite3.Connection, login: str) -> bool:
    candidate = conn.execute(
        "SELECT login, name, company FROM Candidate WHERE login = ?", (login,)
    ).fetchone()
    if not candidate:
        return False

    name = candidate["name"]
    company = candidate["company"]
    success = False

    # LinkedIn via Stagehand
    try:
        li_data = asyncio.run(scrape_linkedin(name, company, login))
        if li_data:
            db.upsert_linkedin_profile(conn, login, li_data)
            console.print(f"  [green]{login}[/green] LinkedIn: {li_data.get('headline', 'found')}")
            success = True
        else:
            db.upsert_linkedin_profile(conn, login, {})
            console.print(f"  [dim]{login}[/dim] LinkedIn: not found")
    except Exception as e:
        console.print(f"  [yellow]{login} LinkedIn error: {e}[/yellow]")
        db.upsert_linkedin_profile(conn, login, {})

    # Web search via Firecrawl
    try:
        mentions = search_and_scrape(name, login)
        if mentions:
            db.insert_web_mentions(conn, login, mentions)
            console.print(f"  [green]{login}[/green] Web: {len(mentions)} mentions")
            success = True
        else:
            console.print(f"  [dim]{login}[/dim] Web: no mentions")
    except Exception as e:
        console.print(f"  [yellow]{login} Web search error: {e}[/yellow]")

    conn.commit()
    return success
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/web_enrich.py
git commit -m "feat: web_enrich.py — LinkedIn + web search orchestrator"
```

---

## Task 14: Pipeline pipeline.py

**Files:**
- Create: `pipeline/src/scout/pipeline.py`

- [ ] **Step 1: Create `pipeline/src/scout/pipeline.py`**

Includes all four steps: fetch → enrich → web-enrich → analyze.

```python
import sqlite3
import time

from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from scout import db, github
from scout.config import DB_PATH, FORK_REPO
from scout.enrich import enrich_candidate
from scout.analyze import analyze_candidate
from scout.web_enrich import web_enrich_candidate, LINKEDIN_DELAY_SECONDS

console = Console()


class RetryableError(Exception):
    pass


@retry(
    retry=retry_if_exception_type(RetryableError),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(5),
)
def _enrich_with_retry(conn: sqlite3.Connection, login: str) -> None:
    try:
        enrich_candidate(conn, login)
    except RuntimeError as e:
        if "rate limit" in str(e).lower() or "502" in str(e) or "503" in str(e):
            raise RetryableError(str(e)) from e
        raise


@retry(
    retry=retry_if_exception_type(RetryableError),
    wait=wait_exponential(multiplier=2, min=4, max=120),
    stop=stop_after_attempt(3),
)
def _analyze_with_retry(conn: sqlite3.Connection, bundle: dict) -> dict | None:
    try:
        return analyze_candidate(conn, bundle)
    except Exception as e:
        err = str(e).lower()
        if "429" in err or "overloaded" in err or "rate" in err or "529" in err:
            raise RetryableError(str(e)) from e
        raise


def run_fetch_forks() -> int:
    conn = db.connect(DB_PATH)
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
    conn = db.connect(DB_PATH)
    logins = db.get_unenriched_logins(conn, limit)
    console.print(f"[bold]Enriching {len(logins)} candidates[/bold]")

    enriched = 0
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("Enriching...", total=len(logins))
        for login in logins:
            try:
                _enrich_with_retry(conn, login)
                enriched += 1
            except Exception as e:
                console.print(f"[red]Failed to enrich {login}: {e}[/red]")
            progress.advance(task)

    conn.close()
    return enriched


def run_web_enrich(limit: int | None = None) -> int:
    conn = db.connect(DB_PATH)
    logins = db.get_unweb_enriched_logins(conn, limit)
    console.print(f"[bold]Web-enriching {len(logins)} candidates[/bold]")

    enriched = 0
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("Web enriching...", total=len(logins))
        for login in logins:
            try:
                if web_enrich_candidate(conn, login):
                    enriched += 1
            except Exception as e:
                console.print(f"[red]Failed to web-enrich {login}: {e}[/red]")
            progress.advance(task)
            time.sleep(LINKEDIN_DELAY_SECONDS)

    conn.close()
    return enriched


def run_analyze(limit: int | None = None) -> int:
    conn = db.connect(DB_PATH)
    logins = db.get_unanalyzed_logins(conn, limit)
    console.print(f"[bold]Analyzing {len(logins)} candidates with Claude[/bold]")

    analyzed = 0
    total_input = 0
    total_output = 0
    total_cache_read = 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("Analyzing...", total=len(logins))
        for login in logins:
            bundle = db.get_candidate_bundle(conn, login)
            if not bundle:
                progress.advance(task)
                continue
            try:
                result = _analyze_with_retry(conn, bundle)
                if result:
                    analyzed += 1
                    total_input += result.get("input_tokens", 0)
                    total_output += result.get("output_tokens", 0)
                    total_cache_read += result.get("cache_read", 0)
                    progress.console.print(
                        f"  [green]{login}[/green] fit={result.get('fit_score')} "
                        f"in={result.get('input_tokens')} out={result.get('output_tokens')} "
                        f"cached={result.get('cache_read')}"
                    )
            except Exception as e:
                console.print(f"[red]Failed to analyze {login}: {e}[/red]")
            progress.advance(task)

    conn.close()
    console.print(f"\n[bold]Analyzed {analyzed} candidates[/bold]")
    console.print(f"Tokens — input: {total_input}, output: {total_output}, cache read: {total_cache_read}")
    return analyzed


def run_full_pipeline() -> None:
    run_fetch_forks()
    run_enrich()
    run_web_enrich()
    run_analyze()
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/pipeline.py
git commit -m "feat: pipeline.py — full orchestrator with web enrichment step"
```

---

## Task 15: Pipeline cli.py

**Files:**
- Create: `pipeline/src/scout/cli.py`

- [ ] **Step 1: Create `pipeline/src/scout/cli.py`**

```python
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from scout import db, pipeline
from scout.config import DB_PATH

app = typer.Typer(help="Talent Scout — GitHub fork profiler pipeline")
console = Console()


@app.command()
def fetch_forks():
    """Fetch all forks of willchen96/mike and store as Candidate rows."""
    count = pipeline.run_fetch_forks()
    console.print(f"[bold green]Done.[/bold green] {count} forks ingested.")


@app.command()
def enrich(limit: Optional[int] = typer.Option(None, help="Max candidates to enrich")):
    """Enrich candidates with GitHub profile, repos, and events."""
    count = pipeline.run_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates enriched.")


@app.command()
def web_enrich(limit: Optional[int] = typer.Option(None, help="Max candidates")):
    """Enrich candidates with LinkedIn and web presence data."""
    count = pipeline.run_web_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates web-enriched.")


@app.command()
def analyze(limit: Optional[int] = typer.Option(None, help="Max candidates to analyze")):
    """Analyze candidates with Claude Opus 4.7 (with live web tools)."""
    count = pipeline.run_analyze(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates analyzed.")


@app.command()
def run():
    """Run full pipeline: fetch-forks -> enrich -> web-enrich -> analyze."""
    pipeline.run_full_pipeline()
    console.print("[bold green]Full pipeline complete.[/bold green]")


@app.command()
def deep_dive(login: str = typer.Argument(help="GitHub login to deep-dive")):
    """Deep-dive a single candidate using Claude Agent SDK."""
    import asyncio
    from scout.deep_dive import run_deep_dive
    result = asyncio.run(run_deep_dive(login))
    console.print(result)


@app.command()
def stats():
    """Print pipeline statistics."""
    conn = db.connect(DB_PATH)
    s = db.get_stats(conn)
    conn.close()

    table = Table(title="Talent Scout Stats")
    table.add_column("Metric", style="cyan")
    table.add_column("Count", justify="right", style="green")

    table.add_row("Total candidates", str(s["candidates"]))
    table.add_row("GitHub enriched", str(s["enriched"]))
    table.add_row("Web enriched", str(s["web_enriched"]))
    table.add_row("Analyzed", str(s["analyzed"]))
    table.add_row("", "")
    for status in ["new", "reviewing", "interested", "contacted", "passed", "hired"]:
        table.add_row(f"Status: {status}", str(s[status]))

    console.print(table)
```

- [ ] **Step 2: Verify CLI loads**

Run: `cd pipeline && uv run scout --help`
Expected: Shows help with 7 commands: `fetch-forks`, `enrich`, `web-enrich`, `analyze`, `run`, `deep-dive`, `stats`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/src/scout/cli.py
git commit -m "feat: cli.py — 7-command Typer CLI"
```

---

## Task 16: Pipeline deep_dive.py

**Files:**
- Create: `pipeline/src/scout/deep_dive.py`

- [ ] **Step 1: Create `pipeline/src/scout/deep_dive.py`**

Uses Claude Agent SDK with a `gh_query` tool. Unchanged from draft plan.

```python
import asyncio
import json
import subprocess
from typing import Any

from claude_agent_sdk import (
    tool, create_sdk_mcp_server, query, ClaudeAgentOptions,
    ResultMessage, AssistantMessage, ToolUseBlock,
)
from rich.console import Console

from scout import db
from scout.config import DB_PATH

console = Console()


@tool(
    "gh_query",
    "Run a GitHub API query using the gh CLI. Returns JSON.",
    {
        "type": "object",
        "properties": {
            "endpoint": {"type": "string", "description": "GitHub API path, e.g. '/users/octocat'"},
            "jq_filter": {"type": "string", "description": "Optional jq filter"},
        },
        "required": ["endpoint"],
    },
)
async def gh_query(args: dict[str, Any]) -> dict[str, Any]:
    cmd = ["gh", "api", args["endpoint"]]
    jq_filter = args.get("jq_filter")
    if jq_filter:
        cmd.extend(["--jq", jq_filter])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {"content": [{"type": "text", "text": f"Error: {result.stderr[:500]}"}], "is_error": True}
        return {"content": [{"type": "text", "text": result.stdout[:10000] or "(empty)"}]}
    except subprocess.TimeoutExpired:
        return {"content": [{"type": "text", "text": "gh api call timed out"}], "is_error": True}


github_server = create_sdk_mcp_server(name="github", version="1.0.0", tools=[gh_query])


async def run_deep_dive(login: str) -> str:
    conn = db.connect(DB_PATH)
    bundle = db.get_candidate_bundle(conn, login)
    context = json.dumps(bundle, default=str)[:5000] if bundle else f"No existing data for {login}"

    final_result = None
    async for message in query(
        prompt=(
            f"Deep-dive research on GitHub developer '{login}'. "
            f"Existing data:\n{context}\n\n"
            f"Use gh_query to investigate: repos, READMEs, commits, contributions, gists. "
            f"Produce a comprehensive profile."
        ),
        options=ClaudeAgentOptions(
            system_prompt="You are a senior engineering talent researcher. Make multiple gh_query calls.",
            mcp_servers={"github": github_server},
            allowed_tools=["mcp__github__gh_query"],
            max_turns=25,
        ),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    console.print(f"  [dim]gh api {block.input.get('endpoint', '')}[/dim]")
        elif isinstance(message, ResultMessage) and message.subtype == "success":
            final_result = message.result

    if final_result:
        existing = conn.execute("SELECT promptVersion FROM Profile WHERE candidateLogin = ?", (login,)).fetchone()
        version = (existing[0] + 1) if existing else 1
        db.upsert_profile(conn, login, {
            "summary": final_result[:2000],
            "model": "claude-agent-sdk-deep-dive",
            "confidence": 0.9, "seniority": "unknown", "fit_score": 3,
            "fit_reasoning": "Deep-dive — see summary",
            "recommended_outreach": "maybe", "outreach_reason": "Requires human review",
            "signals": [], "skills": [],
        }, prompt_version=version)
        conn.commit()
        console.print(f"[green]Profile updated for {login} (v{version})[/green]")

    conn.close()
    return final_result or "No result produced"
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/src/scout/deep_dive.py
git commit -m "feat: deep_dive.py — Claude Agent SDK with gh_query tool"
```

---

## Task 17: Web — shadcn/ui Init

**Files:**
- Create: `web/components.json` (via CLI)
- Create: `web/src/components/ui/*.tsx` (via CLI)
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Initialize shadcn/ui**

Run from `web/`:
```bash
npx shadcn@latest init
```

Accept defaults.

- [ ] **Step 2: Add components**

```bash
npx shadcn@latest add button input select textarea badge card table dialog
```

- [ ] **Step 3: Update layout**

Replace `web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talent Scout",
  description: "GitHub fork profiler CRM for willchen96/mike",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
            <h1 className="text-lg font-semibold">Talent Scout</h1>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: shadcn/ui init with core components"
```

---

## Task 18: Web — Placeholder List Page

> **Note:** This is placeholder UI. Components will be replaced when the UI design arrives. The data plumbing (Prisma queries, filter logic, server component patterns) is built to spec.

**Files:**
- Create: `web/src/components/status-pill.tsx`
- Create: `web/src/components/filter-bar.tsx`
- Create: `web/src/components/candidate-row.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Create `web/src/components/status-pill.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-yellow-100 text-yellow-800",
  interested: "bg-green-100 text-green-800",
  contacted: "bg-purple-100 text-purple-800",
  passed: "bg-gray-100 text-gray-600",
  hired: "bg-emerald-100 text-emerald-900",
};

export function StatusPill({ status }: { status: string }) {
  return <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>{status}</Badge>;
}
```

- [ ] **Step 2: Create `web/src/components/filter-bar.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUSES = ["all", "new", "reviewing", "interested", "contacted", "passed", "hired"];
const SORTS = [
  { value: "fitScore", label: "Fit Score" },
  { value: "followers", label: "Followers" },
  { value: "publicRepos", label: "Public Repos" },
  { value: "fetchedAt", label: "Recently Fetched" },
];

export function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pb-4">
      <Input placeholder="Search..." defaultValue={searchParams.get("q") ?? ""}
             onChange={(e) => update("q", e.target.value)} className="w-64" />
      <Select defaultValue={searchParams.get("status") ?? "all"} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All" : s}</SelectItem>)}</SelectContent>
      </Select>
      <Select defaultValue={searchParams.get("sort") ?? "fitScore"} onValueChange={(v) => update("sort", v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
        <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 3: Create `web/src/components/candidate-row.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "./status-pill";

type Props = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; status: string; topLanguages: string[];
};

export function CandidateRow({ login, name, avatarUrl, location, summary, fitScore, status, topLanguages }: Props) {
  return (
    <Link href={`/candidates/${login}`}
          className="flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
      {avatarUrl && <img src={avatarUrl} alt={login} className="h-10 w-10 rounded-full" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{name || login}</span>
          {name && <span className="text-sm text-muted-foreground">@{login}</span>}
          {location && <span className="text-xs text-muted-foreground">{location}</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">{summary || "No summary yet"}</p>
      </div>
      <div className="flex items-center gap-2">
        {topLanguages.slice(0, 3).map((l) => <Badge key={l} variant="secondary" className="text-xs">{l}</Badge>)}
      </div>
      <div className="flex items-center gap-3">
        {fitScore != null && <Badge variant={fitScore >= 4 ? "default" : "outline"}>{fitScore}/5</Badge>}
        <StatusPill status={status} />
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Replace `web/src/app/page.tsx`**

```tsx
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { buildWhere, buildOrderBy } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { CandidateRow } from "@/components/candidate-row";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params.sort);

  const candidates = await prisma.candidate.findMany({
    where: where as any,
    orderBy: orderBy as any,
    take: 100,
    include: {
      profile: { select: { summary: true, fitScore: true } },
      crm: { select: { status: true } },
      repos: { select: { language: true }, take: 20 },
    },
  });

  return (
    <div>
      <Suspense><FilterBar /></Suspense>
      <div className="space-y-2">
        {candidates.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No candidates found. Run the pipeline first.</p>
        )}
        {candidates.map((c) => {
          const langs = [...new Set(c.repos.map((r) => r.language).filter(Boolean))] as string[];
          return (
            <CandidateRow key={c.login} login={c.login} name={c.name} avatarUrl={c.avatarUrl}
              location={c.location} summary={c.profile?.summary ?? null}
              fitScore={c.profile?.fitScore ?? null} status={c.crm?.status ?? "new"} topLanguages={langs} />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: placeholder list page with filters and candidate rows"
```

---

## Task 19: Web — Placeholder Detail Page + CRM

> **Note:** Placeholder UI — will be replaced by the design. Server actions and data fetching patterns are final.

**Files:**
- Create: `web/src/app/candidates/[login]/actions.ts`
- Create: `web/src/app/candidates/[login]/page.tsx`
- Create: `web/src/components/signal-list.tsx`
- Create: `web/src/components/repo-card.tsx`
- Create: `web/src/components/crm-panel.tsx`

- [ ] **Step 1: Create `web/src/app/candidates/[login]/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function updateCrm(login: string, data: { status?: string; notes?: string; tags?: string }) {
  await prisma.crm.upsert({
    where: { candidateLogin: login },
    create: { candidateLogin: login, ...data },
    update: data,
  });
  revalidatePath(`/candidates/${login}`);
}
```

- [ ] **Step 2: Create `web/src/components/signal-list.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";

const KIND_STYLES: Record<string, string> = {
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  notable: "bg-blue-100 text-blue-800",
};

export function SignalList({ signals }: { signals: { kind: string; text: string }[] }) {
  if (!signals.length) return null;
  return (
    <ul className="space-y-1.5">
      {signals.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Badge variant="outline" className={KIND_STYLES[s.kind] ?? ""}>{s.kind}</Badge>
          <span>{s.text}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Create `web/src/components/repo-card.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, GitFork } from "lucide-react";

type Props = { name: string; htmlUrl: string; description: string | null; language: string | null; stars: number; forks: number; isFork: boolean };

export function RepoCard({ name, htmlUrl, description, language, stars, forks, isFork }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          <a href={htmlUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{name}</a>
          {isFork && <Badge variant="outline" className="ml-2 text-xs">fork</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {description && <p className="line-clamp-2">{description}</p>}
        <div className="flex items-center gap-3 pt-1">
          {language && <Badge variant="secondary">{language}</Badge>}
          <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {stars}</span>
          <span className="flex items-center gap-1"><GitFork className="h-3 w-3" /> {forks}</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create `web/src/components/crm-panel.tsx`**

```tsx
"use client";

import { useRef, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { updateCrm } from "@/app/candidates/[login]/actions";

const STATUSES = ["new", "reviewing", "interested", "contacted", "passed", "hired"];

type Props = { login: string; status: string; notes: string | null; tags: string | null };

export function CrmPanel({ login, status, notes, tags }: Props) {
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  function save(field: string, value: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => { updateCrm(login, { [field]: value }); });
    }, 500);
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">CRM</h3>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Status</label>
          <Select defaultValue={status} onValueChange={(v) => { startTransition(() => updateCrm(login, { status: v })); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Notes</label>
          <Textarea defaultValue={notes ?? ""} placeholder="Add notes..." onChange={(e) => save("notes", e.target.value)} rows={4} />
        </div>
        <div>
          <label className="text-sm font-medium">Tags</label>
          <Input defaultValue={tags ?? ""} placeholder="comma-separated" onChange={(e) => save("tags", e.target.value)} />
        </div>
        {isPending && <p className="text-xs text-muted-foreground">Saving...</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `web/src/app/candidates/[login]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalList } from "@/components/signal-list";
import { RepoCard } from "@/components/repo-card";
import { CrmPanel } from "@/components/crm-panel";

type Props = { params: Promise<{ login: string }> };

export default async function CandidatePage({ params }: Props) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { login },
    include: {
      profile: true, forkMeta: true, signals: true, skills: true,
      repos: { orderBy: { stars: "desc" }, take: 10 },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      crm: true, linkedIn: true,
      webMentions: { orderBy: { scrapedAt: "desc" }, take: 10 },
    },
  });

  if (!candidate) notFound();
  const { profile, signals, skills, repos, events, crm, linkedIn, webMentions } = candidate;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex items-start gap-4">
        {candidate.avatarUrl && <img src={candidate.avatarUrl} alt={login} className="h-16 w-16 rounded-full" />}
        <div>
          <h1 className="text-2xl font-bold">{candidate.name || login}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {candidate.location && <span>{candidate.location}</span>}
            {candidate.company && <span>{candidate.company}</span>}
            <a href={candidate.htmlUrl ?? `https://github.com/${login}`} target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
            {linkedIn?.profileUrl && <a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">LinkedIn</a>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Assessment
                  {profile.fitScore != null && <Badge>{profile.fitScore}/5</Badge>}
                  {profile.seniority && <Badge variant="secondary">{profile.seniority}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.summary && <p>{profile.summary}</p>}
                {profile.fitReasoning && <p className="text-sm text-muted-foreground">{profile.fitReasoning}</p>}
              </CardContent>
            </Card>
          )}

          {signals.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
              <CardContent><SignalList signals={signals.map((s) => ({ kind: s.kind, text: s.text }))} /></CardContent>
            </Card>
          )}

          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)}
            </div>
          )}

          {linkedIn?.headline && (
            <Card>
              <CardHeader><CardTitle>LinkedIn</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{linkedIn.headline}</p>
                {linkedIn.currentTitle && <p>{linkedIn.currentTitle} at {linkedIn.currentCompany}</p>}
              </CardContent>
            </Card>
          )}

          {webMentions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Web Presence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {webMentions.map((m) => (
                  <div key={m.id}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      [{m.source}] {m.title || m.url}
                    </a>
                    {m.snippet && <p className="text-muted-foreground">{m.snippet}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {repos.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold">Top Repos</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {repos.map((r) => (
                  <RepoCard key={r.id} name={r.name} htmlUrl={r.htmlUrl} description={r.description}
                    language={r.language} stars={r.stars} forks={r.forks} isFork={r.isFork} />
                ))}
              </div>
            </div>
          )}

          {events.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {events.slice(0, 15).map((e) => (
                    <div key={e.id} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-xs">{e.type}</Badge>
                      {e.repoName && <span className="truncate">{e.repoName}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <CrmPanel login={login} status={crm?.status ?? "new"} notes={crm?.notes ?? null} tags={crm?.tags ?? null} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/
git commit -m "feat: placeholder detail page with LinkedIn, web mentions, CRM panel"
```

---

## Verification Checklist

Run these in order after all tasks are complete:

- [ ] **1. DB tables:** `sqlite3 data/scout.db ".tables"` → 10 models + `_prisma_migrations`
- [ ] **2. Fork ingest:** `cd pipeline && uv run scout fetch-forks` → ~899 candidates. `uv run scout stats` confirms.
- [ ] **3. GitHub enrich:** `uv run scout enrich --limit 5` → 5 candidates get Repo/Event rows
- [ ] **4. Web enrich:** `uv run scout web-enrich --limit 2` → LinkedInProfile and/or WebMention rows created. Verify: `sqlite3 ../data/scout.db "SELECT candidateLogin, headline FROM LinkedInProfile LIMIT 2"`
- [ ] **5. Analyze:** `uv run scout analyze --limit 5` → Profile rows with `model = claude-opus-4-7`. Verify: `sqlite3 ../data/scout.db "SELECT candidateLogin, fitScore, summary FROM Profile LIMIT 1"`
- [ ] **6. Web list:** `cd web && npm run dev` → `http://localhost:3000` shows candidates, filters work
- [ ] **7. Detail + CRM:** Click a candidate → profile, signals, repos, LinkedIn, web mentions render. Change status, add note, add tag. Refresh → state persists.
- [ ] **8. Deep dive:** `cd pipeline && uv run scout deep-dive <login>` → Profile updates with bumped promptVersion
- [ ] **9. Resumability:** Kill mid-`scout run`, re-run → skips already-processed candidates
