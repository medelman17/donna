# TypeScript Enrichment Agent — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Rewrite the web-triggered enrichment agent in TypeScript using the Vercel AI SDK + Anthropic provider, with native streaming, abort support, and the same 4 tools (gh_query, web_search, web_scrape, linkedin_lookup) plus 2 subagent tools. Python pipeline stays for batch CLI.

---

## Why

The Python agent runs as a subprocess (`exec('uv run scout deep-dive ...')`). This means:
- No real abort — killing the subprocess doesn't stop the Claude API call mid-flight
- Streaming requires Redis pub/sub as a middleman (Python → Redis → SSE → browser)
- Token spend continues even after the user navigates away

The Vercel AI SDK solves all three:
- `abortSignal: req.signal` — when the user closes the SSE connection, the abort signal propagates to Claude and all tools. Tokens stop immediately.
- `streamText()` → `toTextStreamResponse()` — native SSE, no Redis middleman
- Tools defined in TypeScript with Zod schemas, executed in-process

## Architecture

```
Browser                    Next.js Server
┌──────────────┐          ┌───────────────────────────┐
│ EnrichStream │──SSE────▶│ POST /api/enrich/[login]  │
│ (client)     │          │                           │
│ ■ Stop ──────┼─abort───▶│  streamText({             │
│              │          │    model: claude-opus-4-7, │
│              │          │    tools: { gh_query,     │
│              │          │      web_search, ...},    │
│              │          │    abortSignal: req.signal │
│              │          │  })                       │
└──────────────┘          └───────────────────────────┘
```

When the user clicks Stop or navigates away → browser closes the fetch → `req.signal` aborts → `streamText` stops → Claude API call cancelled → no more tokens billed.

## Dependencies

Add to `web/package.json`:
- `ai` (Vercel AI SDK core)
- `@ai-sdk/anthropic` (Anthropic provider)

Already installed: `ioredis` (for cache), `react-markdown`, `remark-gfm`

## Tools (TypeScript)

Same 4 tools as the Python agent, reimplemented in TS:

### 1. `gh_query`
```typescript
tool({
  description: "Query the GitHub REST API",
  parameters: z.object({
    endpoint: z.string().describe("GitHub API path, e.g. /users/octocat"),
    jq_filter: z.string().optional(),
  }),
  execute: async ({ endpoint, jq_filter }, { abortSignal }) => {
    // exec('gh api ...') with signal forwarding
    // Side-effect: persist to Postgres via Prisma
    // Cache in Redis
  },
})
```

### 2. `web_search`
```typescript
tool({
  description: "Search Google for a person or topic",
  parameters: z.object({
    query: z.string(),
    limit: z.number().default(8),
  }),
  execute: async ({ query, limit }) => {
    // Firecrawl search — import firecrawl-js or use fetch to Firecrawl API
    // Cache in Redis
  },
})
```

### 3. `web_scrape`
```typescript
tool({
  description: "Extract content from a URL as markdown",
  parameters: z.object({
    url: z.string(),
  }),
  execute: async ({ url }) => {
    // Firecrawl scrape
    // Side-effect: persist as WebMention via Prisma
    // Cache in Redis
  },
})
```

### 4. `linkedin_lookup`
```typescript
tool({
  description: "Find and extract a LinkedIn profile using a stealth browser",
  parameters: z.object({
    name: z.string(),
    company: z.string().optional(),
  }),
  execute: async ({ name, company }) => {
    // Stagehand/Browserbase — same as Python version
    // Side-effect: persist as LinkedInProfile via Prisma
  },
})
```

### Subagent tools: `technical_assess` and `legal_relevance_assess`

These become **nested `generateText` calls** inside a tool's `execute` function. The Vercel AI SDK supports this natively — a tool can call `generateText` with its own tools:

```typescript
tool({
  description: "Assess code quality by reading source files",
  parameters: z.object({ login: z.string(), repos: z.array(z.string()) }),
  execute: async ({ login, repos }, { abortSignal }) => {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-7"),
      system: ASSESSOR_PROMPT,
      prompt: `Assess ${login}'s code in ${repos.join(", ")}`,
      tools: { gh_query: ghQueryTool },
      maxSteps: 8,
      abortSignal,
    });
    return text;
  },
})
```

The abort signal propagates to the subagent — if the user aborts, the subagent stops too.

## API Route

Replace the current `POST /api/enrich/[login]` (which `exec()`s a Python subprocess) with a streaming endpoint:

### `web/src/app/api/enrich/[login]/route.ts`

```typescript
import { streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { prisma } from "@/lib/prisma";
// ... tool definitions

export async function POST(req: Request, { params }) {
  const { login } = await params;

  const result = streamText({
    model: anthropic("claude-opus-4-7"),
    system: ENRICHMENT_SYSTEM_PROMPT,
    prompt: `Research the GitHub developer '${login}'...`,
    tools: { gh_query, web_search, web_scrape, linkedin_lookup, technical_assess, legal_relevance_assess },
    maxSteps: 25,
    abortSignal: req.signal,
    onStepFinish: ({ text, toolCalls }) => {
      // Log to EnrichmentLog via Prisma
    },
  });

  return result.toTextStreamResponse();
}
```

The GET endpoint for status polling stays (reads from EnrichmentLog in Postgres).

## Client Component

Replace `EnrichStream`'s EventSource approach with the AI SDK's `useChat` or a raw fetch + ReadableStream reader that parses the AI SDK's text stream protocol. The stream includes both text deltas (reasoning) and tool call events.

Since we're using `streamText` (not `useChat`), the client reads the raw SSE:

```typescript
const response = await fetch(`/api/enrich/${login}`, {
  method: "POST",
  signal: abortController.signal,
});
const reader = response.body.getReader();
// Parse text stream for reasoning + tool calls
```

Clicking "■ Stop" calls `abortController.abort()` — the fetch is cancelled, the server's `req.signal` fires, `streamText` stops, Claude API call is cancelled.

## Firecrawl in TypeScript

Two options:
1. **`@anthropic-ai/sdk` web_search/web_fetch server tools** — use Claude's built-in search. Simplest but less control.
2. **Firecrawl JS SDK** (`firecrawl-js`) — direct API calls. More control.
3. **Raw `fetch` to Firecrawl API** — no SDK needed, just HTTP.

Recommend option 3 (raw fetch) — keeps deps minimal and we already have the API key.

## Redis Cache (shared with Python)

Both TS and Python agents use the same Redis cache (same key format `scout:{namespace}:{hash}`). A candidate enriched via CLI won't re-fetch cached data when viewed in the web, and vice versa.

Use `ioredis` (already installed) for cache get/set in the TS tools.

## Prisma (shared with Python)

Both TS and Python write to the same Postgres tables. The TS agent uses Prisma (already set up) for side-effect persistence. The Python agent uses raw psycopg SQL.

## Files

| Path | Action | Purpose |
|---|---|---|
| `web/src/lib/tools/gh-query.ts` | Create | GitHub API tool with Prisma persistence + Redis cache |
| `web/src/lib/tools/web-search.ts` | Create | Firecrawl search tool + Redis cache |
| `web/src/lib/tools/web-scrape.ts` | Create | Firecrawl scrape tool + Prisma persistence |
| `web/src/lib/tools/linkedin-lookup.ts` | Create | Stagehand LinkedIn tool + Prisma persistence |
| `web/src/lib/tools/technical-assess.ts` | Create | Nested generateText subagent for code review |
| `web/src/lib/tools/legal-assess.ts` | Create | Nested generateText subagent for legal relevance |
| `web/src/lib/tools/index.ts` | Create | Exports all tools + system prompt |
| `web/src/lib/redis.ts` | Create | ioredis singleton for tool caching |
| `web/src/app/api/enrich/[login]/route.ts` | Rewrite | streamText with Anthropic + tools + abort |
| `web/src/components/enrich-stream.tsx` | Rewrite | Parse AI SDK text stream instead of custom SSE |
| `web/src/components/detail-with-enrich.tsx` | Modify | Pass AbortController for stop button |

## What stays

- Python pipeline (`scout enrich`, `scout deep-dive`) — unchanged, for batch CLI use
- Redis pub/sub events from Python — still published for CLI-triggered enrichment
- The SSE stream route (`/api/enrich/[login]/stream/route.ts`) — kept for Python-triggered enrichment
- `EnrichmentLog` table — both TS and Python write to it

## What changes

- Web "▸ Enrich" button now triggers the TS agent directly (POST, streaming response)
- "■ Stop" actually aborts the Claude API call
- No more subprocess spawning from the web
- Streaming comes from `streamText` protocol, not custom Redis pub/sub
