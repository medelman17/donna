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
