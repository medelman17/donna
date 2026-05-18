# json-render Enrichment UI — Design Spec

**Date:** 2026-05-18
**Status:** Approved
**Scope:** Replace the raw text/tool-call streaming UI with a json-render powered generative UI. The enrichment agent outputs json-render specs as part of its text stream, and the client renders them as beautiful, structured components using a custom catalog of enrichment UI primitives.

---

## Overview

Currently the enrichment stream renders raw markdown text and a flat list of tool calls. The agent's reasoning is unstructured and the tool calls are just JSON strings. With json-render, the agent's output becomes **structured UI** — cards, metrics, timelines, badges — that render progressively as the agent works.

## Architecture

```
Agent (streamText)              Client (React)
┌──────────────────┐           ┌───────────────────────┐
│ Claude Opus 4.7  │           │ useUIStream()         │
│                  │           │   ↓                   │
│ System prompt    │──stream──▶│ <Renderer             │
│ includes catalog │           │   spec={spec}         │
│ .prompt()        │           │   registry={registry} │
│                  │           │   loading={streaming}  │
│ Agent outputs    │           │ />                    │
│ json-render JSON │           │                       │
│ as its text      │           │ Progressive rendering │
└──────────────────┘           └───────────────────────┘
```

The key insight: `catalog.prompt()` generates a system prompt that teaches the agent to output valid json-render JSON specs. The agent's text output IS the UI spec. The `<Renderer>` component parses and renders it progressively as it streams in.

## Catalog (Enrichment Components)

Define components specific to the enrichment workflow:

| Component | Purpose | Props |
|---|---|---|
| `ReasoningCard` | Agent's thinking/analysis | `title`, `step` number |
| `ToolCallRow` | Compact tool call display | `tool`, `detail`, `status` (success/error/running) |
| `MetricGrid` | Stats display (followers, repos, etc.) | `metrics: [{label, value, sub}]` |
| `SignalCard` | Positive/negative/notable finding | `kind`, `text` |
| `SubagentSection` | Collapsible subagent results | `name`, `icon`, `duration` |
| `SummaryCard` | Final assessment | `rating` (Deep/Adjacent/Transferable/None) |
| `ProfileHeader` | Candidate identity | `name`, `login`, `avatar`, `bio`, `links[]` |
| `RepoCard` | Repository finding | `name`, `language`, `stars`, `description` |
| `LinkedInCard` | LinkedIn profile data | `headline`, `title`, `company`, `experience[]` |
| `WebMentionCard` | Web finding | `source`, `title`, `url`, `snippet` |
| `Badge` | Inline status/tag | `text`, `variant` (green/red/blue/gray) |
| `Divider` | Visual separator | `label` (optional) |

These map to React components styled with the existing design system CSS.

## Implementation

### Dependencies
```bash
npm install @json-render/core @json-render/react
```

### Catalog definition (`web/src/lib/enrich-catalog.ts`)
```typescript
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";

export const enrichCatalog = defineCatalog(schema, {
  components: {
    ReasoningCard: { props: z.object({ title: z.string(), step: z.number().optional() }) },
    ToolCallRow: { props: z.object({ tool: z.string(), detail: z.string(), status: z.enum(["success","error","running"]) }) },
    MetricGrid: { props: z.object({ metrics: z.array(z.object({ label: z.string(), value: z.string(), sub: z.string().optional() })) }) },
    // ... etc
  },
  actions: {},
});
```

### Registry (`web/src/lib/enrich-registry.tsx`)
Map catalog to React components using the existing design system CSS classes.

### API route update
Add `catalog.prompt()` to the enrichment agent's system prompt so it knows to output json-render specs.

### Client update
Replace the manual stream parser with `useUIStream` + `<Renderer>`.

## What stays
- The `streamText` + `fullStream` + custom SSE pattern in the API route
- The abort/stop functionality
- The Python CLI enrichment (unchanged)
- The tool implementations (unchanged)

## What changes
- Agent's text output format: raw markdown → json-render JSON specs
- Client rendering: manual React → `<Renderer spec={spec} registry={registry} />`
- Progressive rendering is automatic via `useUIStream`

## Files
| Path | Action |
|---|---|
| `web/src/lib/enrich-catalog.ts` | Create — catalog definition |
| `web/src/lib/enrich-registry.tsx` | Create — React component implementations |
| `web/src/lib/tools/index.ts` | Modify — include catalog.prompt() in system prompt |
| `web/src/app/api/enrich/[login]/route.ts` | Modify — use toTextStreamResponse() for json-render |
| `web/src/components/enrich-stream.tsx` | Rewrite — useUIStream + Renderer |
