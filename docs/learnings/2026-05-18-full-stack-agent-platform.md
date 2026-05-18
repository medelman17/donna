# Full-Stack Agent Platform — Session Learnings

**Date:** 2026-05-18
**Context:** Built a complete GitHub fork profiler + CRM from scratch in one session — Python pipeline, Next.js 16 web app, Postgres + pgvector + Redis, Claude Agent SDK enrichment, Vercel AI SDK TypeScript agent, streaming UI.

## Gotcha 1: Firecrawl SDK v2 — SearchData.web not .data

**Error/Symptom:** `web_search` tool returned 0 results for every query despite the API working fine when tested directly.

**Root Cause:** Firecrawl's Python SDK v2 returns `SearchData` with a `.web` attribute (list of `SearchResultWeb`), not `.data`. The code checked `.data` first, got `None`, fell through to empty list.

**Fix:**
```python
items = []
if hasattr(result, "web") and result.web:
    items = result.web
elif hasattr(result, "data") and result.data:
    items = result.data
```

## Gotcha 2: Prisma 7 — pgvector Unsupported type breaks migrations

**Error/Symptom:** `prisma migrate dev` fails with `type "vector" does not exist` even though pgvector extension is installed.

**Root Cause:** Prisma creates a shadow database for migration diffing. The pgvector extension exists in the main DB but not the shadow DB. `Unsupported("vector(1536)")` in the schema tries to create the column in the shadow DB which doesn't have the extension.

**Fix:** Remove `Unsupported("vector(1536)")` from schema.prisma, add the column via raw SQL after migration:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "Profile" ADD COLUMN IF NOT EXISTS embedding vector(1536);
```

## Gotcha 3: Prisma 7 — Postgres requires double-quoted camelCase columns

**Error/Symptom:** `invalid input syntax for type json` and cascading `current transaction is aborted` errors when inserting to Postgres via psycopg.

**Root Cause:** Prisma generates camelCase column names. Postgres lowercases unquoted identifiers. `candidateLogin` becomes `candidatelogin` which doesn't match the actual column. Every SQL statement needs double-quoted column names: `"candidateLogin"`, `"publicRepos"`, etc.

**Fix:** Double-quote every camelCase column and table name in all raw SQL:
```python
conn.execute("""INSERT INTO "Candidate" ("candidateLogin", "publicRepos") VALUES (%s, %s)""", ...)
```

## Gotcha 4: psycopg transaction rollback required after errors

**Error/Symptom:** One failed INSERT causes all subsequent queries on the same connection to fail with `current transaction is aborted, commands ignored until end of transaction block`.

**Root Cause:** PostgreSQL aborts the entire transaction on any error. Unlike SQLite which just skips the bad statement, Postgres requires an explicit `ROLLBACK` before the connection can run more queries.

**Fix:** Wrap every side-effect persistence in try/except with rollback:
```python
try:
    db.upsert_candidate(conn, data)
    conn.commit()
except Exception:
    try: conn.rollback()
    except Exception: pass
```

## Gotcha 5: Vercel AI SDK v6 — API surface changes from v5

**Error/Symptom:** Build errors: `maxSteps` not recognized, `parameters` not recognized, `toTextStreamResponse` not recognized.

**Root Cause:** AI SDK v6 renamed several APIs:
- `parameters` → `inputSchema` (tool definitions)
- `maxSteps` → `stopWhen: stepCountIs(N)` (step limiting)
- `toTextStreamResponse()` → `toDataStreamResponse()` (but we use custom stream)
- `fullStream` chunks: `textDelta` → `text`, `args` → `input`, `result` → `output`

**Fix:** Check the actual installed version's type definitions:
```bash
grep "stopWhen\|inputSchema\|parameters" web/node_modules/ai/dist/index.d.mts | head -5
```

## Gotcha 6: AI SDK fullStream — AsyncIterable not ReadableStream

**Error/Symptom:** `Error: failed to pipe response` when using `result.fullStream.pipeThrough(transformStream)`.

**Root Cause:** In AI SDK v6, `fullStream` returns an `AsyncIterable`, not a `ReadableStream`. You can't call `.pipeThrough()` on it.

**Fix:** Use `for await...of` in a `ReadableStream` constructor:
```typescript
const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of result.fullStream) {
      // transform and enqueue
    }
    controller.close();
  },
});
```

## Gotcha 7: React 19 strict mode double-invokes effects

**Error/Symptom:** `ERR_ABORTED` on the POST fetch to trigger enrichment. Two requests fire, both get cancelled.

**Root Cause:** React 19 strict mode in development mounts, unmounts, then re-mounts components. If the cleanup function calls `controller.abort()`, the first mount's fetch gets aborted, then the second mount fires a new fetch that also gets aborted.

**Fix:** Don't abort in the cleanup. Use a `cancelled` flag instead, and only abort on explicit user action (Stop button):
```typescript
useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();
  abortRef.current = controller;
  const run = async () => { /* ... */ if (cancelled) return; /* ... */ };
  run();
  return () => { cancelled = true; };  // NOT controller.abort()
}, []);
```

## Gotcha 8: Claude Agent SDK — TextBlock import needed separately

**Error/Symptom:** Agent reasoning text wasn't being displayed — only tool calls showed up.

**Root Cause:** `TextBlock` must be explicitly imported from `claude_agent_sdk` and checked alongside `ToolUseBlock` when processing `AssistantMessage.content` blocks.

**Fix:**
```python
from claude_agent_sdk import AssistantMessage, ToolUseBlock, TextBlock
for block in message.content:
    if isinstance(block, TextBlock):
        print(block.text)  # agent's reasoning
    elif isinstance(block, ToolUseBlock):
        print(block.input)  # tool call
```

## Gotcha 9: Rich Live display — screen=True vs transient=True

**Error/Symptom:** Previous agent reasoning steps disappear when new ones arrive — no scrollback.

**Root Cause:** `Live(screen=True)` uses the alternate screen buffer (like vim) — no scrollback at all. `Live(transient=True)` erases and redraws in place — scrollback exists but Live erases its own output on each update.

**Workaround:** Use `transient=True` and print completed steps to the terminal permanently via `live.console.print()` before updating the Live panel with the new step.

## Summary

The biggest class of issues was **API surface mismatches** — Firecrawl SDK, AI SDK v6, Prisma 7, and psycopg all had APIs that differed from documentation or from prior versions. The pattern: always check the actual installed package's type definitions (`grep` the `.d.ts` or `.d.mts` files) rather than trusting docs or training data. For Postgres specifically, the camelCase quoting and transaction rollback requirements are pervasive — every raw SQL query needs attention.
