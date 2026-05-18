# Enrichment Stream UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the agent's enrichment reasoning, tool calls, and subagent findings to the web UI in real-time via Redis pub/sub → SSE → styled React components that take over the detail page's main content area.

**Architecture:** Pipeline publishes typed JSON events to Redis pub/sub channel `scout:enrich:{login}`. A Next.js API route subscribes and pipes as SSE. A React client component renders each event type: markdown cards for reasoning, compact rows for tool calls, collapsible sections for subagent findings, and a green summary card at the end.

**Tech Stack:** Redis pub/sub (already running), ioredis (Node.js Redis client), react-markdown + remark-gfm, SSE via ReadableStream API, Next.js 16 App Router.

---

## Task 1: Python Event Publisher + Pipeline Integration

**Files:**
- Create: `pipeline/src/scout/events.py`
- Modify: `pipeline/src/scout/tools.py`
- Modify: `pipeline/src/scout/enrich.py`

- [ ] **Step 1: Create `pipeline/src/scout/events.py`**

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


def publish(login: str, event_type: str, data: dict | None = None) -> None:
    event = {"type": event_type, **(data or {})}
    try:
        _get_pub().publish(f"scout:enrich:{login}", json.dumps(event, default=str))
    except Exception:
        pass
```

- [ ] **Step 2: Add publish calls to `pipeline/src/scout/tools.py`**

Add `from scout.events import publish` at the top imports.

In `_notify_display`, add after the existing try/except:
```python
def _notify_display(tool: str, detail: str, duration_ms: int = 0, ok: bool = True) -> None:
    try:
        from scout.enrich import get_display
        d = get_display()
        if d:
            d.add_tool_call(tool, detail, duration_ms, ok)
    except Exception:
        pass
    publish(_current_login, "tool_call", {"tool": tool, "detail": detail, "durationMs": duration_ms, "ok": ok})
```

In `_notify_persist`, add after the existing try/except:
```python
def _notify_persist(what: str) -> None:
    try:
        from scout.enrich import get_display
        d = get_display()
        if d:
            d.add_persist(what)
    except Exception:
        pass
    publish(_current_login, "persist", {"what": what})
```

In the `technical_assess` tool, where it pushes to the display for subagent reasoning, also publish:
```python
publish(_current_login, "subagent_reasoning", {"name": "Technical Assessor", "text": block.text.strip()})
```
And at start/end:
```python
# at start:
publish(_current_login, "subagent_start", {"name": "Technical Assessor", "description": "Reading source code"})
# at end:
publish(_current_login, "subagent_end", {"name": "Technical Assessor", "duration_ms": duration})
```

Same pattern for `legal_relevance_assess`.

- [ ] **Step 3: Add publish calls to `pipeline/src/scout/enrich.py`**

Add `from scout.events import publish` at the top.

In the streaming loop where `set_reasoning` is called, also publish:
```python
if isinstance(block, TextBlock):
    text = block.text.strip()
    if text:
        display.set_reasoning(text)
        publish(login, "reasoning", {"step": display.steps, "text": text})
        live.update(display.render())
```

After the streaming loop completes, publish summary and done:
```python
if final_text:
    publish(login, "summary", {"text": final_text})

publish(login, "done", {
    "tool_calls": result["tool_calls"],
    "steps": result["steps"],
    "duration_ms": duration,
})
```

- [ ] **Step 4: Verify**

Run: `cd pipeline && uv run python -c "from scout.events import publish; publish('test', 'ping', {'msg': 'hello'}); print('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/scout/events.py pipeline/src/scout/tools.py pipeline/src/scout/enrich.py
git commit -m "feat: Redis pub/sub event publishing from pipeline"
```

---

## Task 2: Web Dependencies + SSE API Route

**Files:**
- Modify: `web/package.json`
- Create: `web/src/app/api/enrich/[login]/stream/route.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd web && npm install ioredis react-markdown remark-gfm
```

- [ ] **Step 2: Create `web/src/app/api/enrich/[login]/stream/route.ts`**

```typescript
import { NextRequest } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

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

      sub.on("message", (_channel: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      const cleanup = () => {
        sub.unsubscribe();
        sub.quit();
        try { controller.close(); } catch {}
      };

      request.signal.addEventListener("abort", cleanup);
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

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds with `/api/enrich/[login]/stream` route.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat: SSE API route for enrichment event streaming via Redis"
```

---

## Task 3: EnrichStream Client Component

**Files:**
- Create: `web/src/components/enrich-stream.tsx`
- Rewrite: `web/src/components/enrich-button.tsx`

- [ ] **Step 1: Create `web/src/components/enrich-stream.tsx`**

The main streaming UI component that renders the event feed:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type EnrichEvent =
  | { type: "reasoning"; step: number; text: string }
  | { type: "tool_call"; tool: string; detail: string; durationMs: number; ok: boolean }
  | { type: "persist"; what: string }
  | { type: "subagent_start"; name: string; description: string }
  | { type: "subagent_reasoning"; name: string; text: string }
  | { type: "subagent_end"; name: string; duration_ms: number }
  | { type: "summary"; text: string }
  | { type: "done"; tool_calls: number; steps: number; duration_ms: number }
  | { type: "error"; message: string };

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [events, setEvents] = useState<EnrichEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [persisted, setPersisted] = useState<string[]>([]);
  const [toolCount, setToolCount] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trigger = async () => {
      await fetch(`/api/enrich/${login}`, { method: "POST" });
    };
    trigger();

    const evtSource = new EventSource(`/api/enrich/${login}/stream`);
    setStatus("streaming");

    evtSource.onmessage = (e) => {
      const event: EnrichEvent = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);

      if (event.type === "tool_call") setToolCount(c => c + 1);
      if (event.type === "reasoning") setStepCount(event.step);
      if (event.type === "persist") setPersisted(p => p.includes(event.what) ? p : [...p, event.what]);

      if (event.type === "done") {
        setStatus("done");
        evtSource.close();
        setTimeout(() => {
          router.refresh();
          onDone();
        }, 3000);
      }
    };

    evtSource.onerror = () => {
      if (status !== "done") {
        setStatus("done");
        evtSource.close();
      }
    };

    return () => evtSource.close();
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="dx" style={{ padding: "16px 28px" }}>
      {/* Status bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
        background: "var(--color-bg-2)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-DEFAULT)", marginBottom: 16, fontSize: 12,
      }}>
        <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>{login}</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toolCount} tools</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{stepCount} steps</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>
        {persisted.length > 0 && (
          <>
            <span style={{ color: "var(--color-fg-muted)" }}>·</span>
            <span>Saved: {persisted.map(p => (
              <span key={p} style={{
                background: "#d8efde", color: "#1f7a3e", fontSize: 10.5,
                padding: "1px 6px", borderRadius: 999, marginLeft: 4, fontWeight: 500,
              }}>✓ {p}</span>
            ))}</span>
          </>
        )}
        {status === "streaming" && (
          <span style={{ marginLeft: "auto", color: "var(--color-accent)", fontWeight: 500 }}>
            ● Live
          </span>
        )}
        {status === "done" && (
          <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 500 }}>
            ✓ Complete
          </span>
        )}
      </div>

      {/* Event feed */}
      <div ref={scrollRef} style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
        {status === "connecting" && (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: 20, textAlign: "center" }}>
            Connecting to enrichment agent...
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: EnrichEvent }) {
  switch (event.type) {
    case "reasoning":
      return (
        <div style={{
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)",
          padding: "10px 14px", marginBottom: 8,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Step {event.step}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-fg)" }}>
            <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
          </div>
        </div>
      );

    case "tool_call":
      return (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "3px 14px", fontSize: 11.5,
          fontFamily: "var(--font-geist-mono)", color: "var(--color-fg-muted)",
        }}>
          <span style={{ color: event.ok ? "#16a34a" : "#dc2626" }}>{event.ok ? "✓" : "✗"}</span>
          <span style={{ fontWeight: 500 }}>{event.tool}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.detail}</span>
          {event.durationMs > 0 && <span style={{ color: "var(--color-fg-subtle)" }}>({event.durationMs}ms)</span>}
        </div>
      );

    case "subagent_start":
      return (
        <div style={{
          borderTop: "1px dashed var(--color-border-strong)", marginTop: 12, paddingTop: 10, marginBottom: 4,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)" }}>
            {event.name === "Technical Assessor" ? "🔍" : "⚖️"} {event.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginLeft: 8 }}>{event.description}</span>
        </div>
      );

    case "subagent_reasoning":
      return (
        <div style={{
          borderLeft: `3px solid ${event.name === "Technical Assessor" ? "#2563eb" : "#8b5cf6"}`,
          padding: "8px 14px", marginBottom: 6, marginLeft: 8,
          fontSize: 12.5, lineHeight: 1.5, color: "var(--color-fg)",
        }}>
          <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
        </div>
      );

    case "subagent_end":
      return (
        <div style={{
          fontSize: 11, color: "var(--color-fg-subtle)", padding: "2px 14px", marginBottom: 12, marginLeft: 8,
        }}>
          {event.name} completed in {(event.duration_ms / 1000).toFixed(1)}s
        </div>
      );

    case "summary":
      return (
        <div style={{
          border: "1px solid color-mix(in oklab, #16a34a, transparent 70%)",
          background: "color-mix(in oklab, #16a34a, transparent 95%)",
          borderRadius: "var(--radius-lg)", padding: "14px 18px", marginTop: 16, marginBottom: 8,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Summary
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-fg)" }}>
            <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
          </div>
        </div>
      );

    case "done":
      return (
        <div style={{
          textAlign: "center", padding: 16, fontSize: 12, color: "#16a34a", fontWeight: 500,
        }}>
          ✓ Enrichment complete — {event.tool_calls} tool calls, {event.steps} steps, {(event.duration_ms / 1000).toFixed(1)}s
        </div>
      );

    case "error":
      return (
        <div style={{
          background: "color-mix(in oklab, #dc2626, transparent 96%)",
          border: "1px solid color-mix(in oklab, #dc2626, transparent 70%)",
          borderRadius: "var(--radius-DEFAULT)", padding: "8px 14px", marginBottom: 8,
          color: "#dc2626", fontSize: 12.5,
        }}>
          Error: {event.message}
        </div>
      );

    default:
      return null;
  }
}
```

- [ ] **Step 2: Rewrite `web/src/components/enrich-button.tsx`**

Simplified — just triggers the stream view:

```tsx
"use client";

import { useState } from "react";
import { EnrichStream } from "./enrich-stream";

export function EnrichButton({ login }: { login: string }) {
  const [streaming, setStreaming] = useState(false);

  if (streaming) {
    return <EnrichStream login={login} onDone={() => setStreaming(false)} />;
  }

  return (
    <button className="filter-btn" onClick={() => setStreaming(true)}>
      <span className="val">▸ Enrich with agent</span>
    </button>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/
git commit -m "feat: EnrichStream component with SSE event rendering"
```

---

## Task 4: Detail Page Integration

**Files:**
- Modify: `web/src/app/candidates/[login]/page.tsx`

- [ ] **Step 1: Update the detail page**

Move the `EnrichButton` from the sidebar into the main content area, and make it take over `.detail-main` when streaming. The key change: `EnrichButton` currently sits in the aside — move it so that when `streaming=true`, it renders the `EnrichStream` component INSTEAD of the normal main content.

Create a client wrapper component that manages the streaming state:

Replace the current `EnrichButton` usage in the aside with a simpler trigger, and add a client wrapper around the main content.

In `web/src/app/candidates/[login]/page.tsx`:

a) Remove the `EnrichButton` import and its usage in the aside section.

b) Add a new client wrapper. Create `web/src/components/detail-with-enrich.tsx`:

```tsx
"use client";

import { useState } from "react";
import { EnrichStream } from "./enrich-stream";

export function DetailWithEnrich({
  login,
  children,
}: {
  login: string;
  children: React.ReactNode;
}) {
  const [streaming, setStreaming] = useState(false);

  if (streaming) {
    return (
      <main className="detail-main">
        <EnrichStream login={login} onDone={() => setStreaming(false)} />
      </main>
    );
  }

  return (
    <main className="detail-main">
      <div className="dx">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <a href="/" className="tb-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>← All candidates</a>
          <button className="filter-btn" onClick={() => setStreaming(true)}>
            <span className="val">▸ Enrich with agent</span>
          </button>
        </div>
        {children}
      </div>
    </main>
  );
}
```

c) In `page.tsx`, replace the `<main className="detail-main">` section with this wrapper. The page passes all the detail content as children. Remove the old back-link from inside the main since it's now in the wrapper.

- [ ] **Step 2: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Verify end-to-end**

1. Start web: `cd web && npm run dev`
2. Start enrichment from CLI: `cd pipeline && uv run scout deep-dive 0xNadr`
3. Open `http://localhost:3000/candidates/0xNadr` in browser
4. Click "▸ Enrich with agent"
5. Expected: Main content area shows live event stream with markdown reasoning cards, tool call rows, and subagent sections

- [ ] **Step 4: Commit**

```bash
git add web/src/
git commit -m "feat: detail page enrichment stream — main content takeover with live SSE"
```

---

## Verification Checklist

- [ ] **1.** Pipeline publishes to Redis: run `redis-cli -p 63790 subscribe "scout:enrich:test"` in one terminal, run `cd pipeline && uv run python -c "from scout.events import publish; publish('test', 'reasoning', {'step': 1, 'text': 'hello'})"` in another — should see the event
- [ ] **2.** SSE endpoint works: `curl -N http://localhost:3000/api/enrich/test/stream` while publishing test events — should see `data: {...}` lines
- [ ] **3.** Web build passes: `cd web && npm run build`
- [ ] **4.** Click "Enrich with agent" on a candidate detail page → main content shows live stream with markdown cards, tool calls, subagent sections
- [ ] **5.** When enrichment completes, the "done" event shows, then the page refreshes to show the new data
