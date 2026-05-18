# Enrichment Stream UI — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Stream the agent's enrichment reasoning, tool calls, and subagent findings to the web UI in real-time via Redis pub/sub → SSE → typed React components.

---

## Overview

Currently when enrichment runs (CLI or web-triggered), the web UI only shows "Enrichment complete (N tool calls)" in the sidebar. The CLI has a rich Live display with agent reasoning, tool calls, and subagent findings. This spec brings that same experience to the browser.

**Architecture:**

```
Pipeline (Python)                    Web (Next.js)
┌─────────────┐                     ┌──────────────────┐
│ tools.py    │──publish──▶ Redis   │ GET /api/enrich/ │
│ enrich.py   │  channel:          │   [login]/stream │
│             │  scout:enrich:     │      │           │
│ subagents   │  {login}           │      ▼ subscribe │
└─────────────┘                     │   SSE stream    │
                                    │      │           │
                                    │      ▼           │
                                    │ EnrichStream.tsx │
                                    │ (client component)│
                                    └──────────────────┘
```

## Event Types

The pipeline publishes JSON events to Redis. Each event has a `type` field:

| Type | Payload | UI Treatment |
|---|---|---|
| `reasoning` | `{step: N, text: string}` | Markdown card with step number, rendered via react-markdown |
| `tool_call` | `{tool: string, detail: string, durationMs: number, ok: boolean}` | Compact row in a tool log list — green ✓ or red ✗, tool name, detail, timing |
| `tool_error` | `{tool: string, error: string}` | Red error row in tool log |
| `persist` | `{what: string}` | Badge/chip that accumulates ("Candidate", "10 Repos", "LinkedInProfile") |
| `subagent_start` | `{name: string, description: string}` | Collapsible section header (🔍 Technical Assessor, ⚖️ Legal Assessor) |
| `subagent_reasoning` | `{name: string, text: string}` | Markdown inside the subagent's collapsible section |
| `subagent_end` | `{name: string, duration_ms: number}` | Close the collapsible section, show timing |
| `summary` | `{text: string}` | Final markdown card with green border — the agent's conclusion |
| `done` | `{tool_calls: number, steps: number, duration_ms: number}` | Hide the stream, refresh the detail page to show new data |
| `error` | `{message: string}` | Red error banner |

## Pipeline Side (Python)

### New module: `pipeline/src/scout/events.py`

```python
import json
import redis
from scout.config import get_redis_url

_pub_client: redis.Redis | None = None

def _get_pub() -> redis.Redis:
    global _pub_client
    if _pub_client is None:
        _pub_client = redis.Redis.from_url(get_redis_url(), decode_responses=True)
    return _pub_client

def publish(login: str, event_type: str, data: dict) -> None:
    event = {"type": event_type, **data}
    _get_pub().publish(f"scout:enrich:{login}", json.dumps(event, default=str))
```

### Integration points

**`tools.py`** — Each `_notify_display` call also publishes:
```python
from scout.events import publish
# In _notify_display:
publish(_current_login, "tool_call", {"tool": tool, "detail": detail, "durationMs": duration_ms, "ok": ok})
# In _notify_persist:
publish(_current_login, "persist", {"what": what})
```

**`enrich.py`** — Each reasoning step and subagent event publishes:
```python
from scout.events import publish
# On TextBlock:
publish(login, "reasoning", {"step": display.steps, "text": text})
# On subagent reasoning (in tools.py):
publish(_current_login, "subagent_reasoning", {"name": "Technical Assessor", "text": text})
# On done:
publish(login, "done", {"tool_calls": ..., "steps": ..., "duration_ms": ...})
```

The existing CLI display (`EnrichmentDisplay`) continues to work — publishing to Redis is additive, not a replacement.

## Web Side (Next.js)

### SSE API route: `web/src/app/api/enrich/[login]/stream/route.ts`

```typescript
import { NextRequest } from "next/server";
import Redis from "ioredis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;
  const redisUrl = process.env.REDIS_URL || "redis://localhost:63790";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sub = new Redis(redisUrl);
      sub.subscribe(`scout:enrich:${login}`);

      sub.on("message", (channel, message) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      request.signal.addEventListener("abort", () => {
        sub.unsubscribe();
        sub.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### Dependencies

Add to `web/package.json`:
- `ioredis` — Redis client for the SSE subscriber
- `react-markdown` — Render agent reasoning as markdown
- `remark-gfm` — GitHub-flavored markdown support (tables, strikethrough)

### Client component: `web/src/components/enrich-stream.tsx`

A client component that:
1. Triggers enrichment via POST to `/api/enrich/[login]`
2. Opens an SSE connection to `/api/enrich/[login]/stream`
3. Renders each event type as a styled component
4. When `done` event arrives, closes SSE and refreshes the page

**Layout during enrichment:**

```
┌─ Main content area ──────────────────────────────────────┐
│ ┌─ Status bar ─────────────────────────────────────────┐ │
│ │ 0xNadr · 12 tools · 4 steps · 23s · Saved: ✓ ✓ ✓  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Step 1 ─────────────────────────────────────────────┐ │
│ │ I'll start by pulling the GitHub profile for 0xNadr  │ │
│ │ to understand who they are...                        │ │
│ └──────────────────────────────────────────────────────┘ │
│ ✓ gh_query /users/0xNadr (1283 chars) 196ms             │
│ ✓ gh_query /users/0xNadr/repos?sort=stars (52k) 410ms   │
│                                                          │
│ ┌─ Step 2 ─────────────────────────────────────────────┐ │
│ │ **Interesting profile.** Nader Bennour, Senior AI &  │ │
│ │ LLM Engineer in Munich. Has a personal site at       │ │
│ │ nader.info — let me scrape that...                   │ │
│ └──────────────────────────────────────────────────────┘ │
│ ✓ web_scrape nader.info (12k chars) 2100ms               │
│                                                          │
│ ┌─ 🔍 Technical Assessor ─────────────────────────────┐ │
│ │ Code quality is high. The opensheet-core repo shows  │ │
│ │ clean TypeScript architecture with proper error...   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ ⚖️ Legal Relevance ────────────────────────────────┐ │
│ │ Rating: **Transferable**. No direct legal-tech work  │ │
│ │ found, but RAG pipeline expertise maps directly...   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Summary (green border) ─────────────────────────────┐ │
│ │ Nader Bennour is a senior AI/ML engineer based in    │ │
│ │ Munich specializing in RAG systems and LLM ops...    │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Each card is rendered with the design system CSS — same border colors, radius, font sizes as the rest of the app. Reasoning uses `react-markdown` with `remark-gfm`. Tool calls use the same compact monospace style as the CLI.

### Detail page integration

When the user clicks "Enrich with agent", the main content area (`.detail-main .dx`) switches from showing the normal candidate detail to showing the `EnrichStream` component. When enrichment completes (`done` event), it transitions back to the normal detail view with all the new data populated.

The CRM sidebar stays visible throughout.

## Files Changed/Created

| Path | Action | Purpose |
|---|---|---|
| `pipeline/src/scout/events.py` | Create | Redis pub/sub publisher |
| `pipeline/src/scout/tools.py` | Modify | Add `publish()` calls alongside `_notify_display` |
| `pipeline/src/scout/enrich.py` | Modify | Add `publish()` calls for reasoning and done events |
| `web/package.json` | Modify | Add `ioredis`, `react-markdown`, `remark-gfm` |
| `web/src/app/api/enrich/[login]/stream/route.ts` | Create | SSE endpoint that subscribes to Redis |
| `web/src/components/enrich-stream.tsx` | Create | Client component that renders the event stream |
| `web/src/components/enrich-button.tsx` | Modify | Trigger now opens EnrichStream instead of polling |
| `web/src/app/candidates/[login]/page.tsx` | Modify | Pass candidate data to EnrichStream for the transition |

## Not in scope

- Replay of past enrichment streams (events are ephemeral via pub/sub)
- Multiple concurrent enrichment streams for the same candidate
- WebSocket transport (SSE is sufficient for one-directional server→client)
