# TypeScript Enrichment Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the web-triggered enrichment agent in TypeScript using the Vercel AI SDK + Anthropic provider, with native streaming, real abort support, and the same tools — running in-process in Next.js instead of as a Python subprocess.

**Architecture:** A POST route at `/api/enrich/[login]` calls `streamText()` with Claude Opus 4.7 and 6 tools (gh_query, web_search, web_scrape, linkedin_lookup, technical_assess, legal_assess). The response is a native SSE text stream. The client reads it with `fetch` + `ReadableStream`. Clicking "Stop" calls `abortController.abort()` which propagates through `req.signal` → `streamText` → Claude API → immediate token savings. Tools persist data to Postgres via Prisma and cache in Redis via ioredis.

**Tech Stack:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Next.js 16 App Router, Prisma 7, ioredis, Zod

---

## File Map

```
web/src/
├── lib/
│   ├── redis.ts                       (NEW — ioredis singleton for tool caching)
│   └── tools/
│       ├── index.ts                   (NEW — exports all tools + system prompt)
│       ├── gh-query.ts                (NEW — GitHub API tool)
│       ├── web-search.ts              (NEW — Firecrawl search tool)
│       ├── web-scrape.ts              (NEW — Firecrawl scrape tool)
│       ├── linkedin-lookup.ts         (NEW — Stagehand LinkedIn tool)
│       ├── technical-assess.ts        (NEW — nested generateText subagent)
│       └── legal-assess.ts            (NEW — nested generateText subagent)
├── app/api/enrich/[login]/
│   ├── route.ts                       (REWRITE — streamText with tools + abort)
│   └── stream/route.ts                (KEEP — for Python CLI-triggered enrichment)
└── components/
    ├── enrich-stream.tsx              (REWRITE — parse AI SDK text stream)
    └── detail-with-enrich.tsx         (MODIFY — abort controller)
```

---

## Task 1: Dependencies + Redis Singleton

**Files:**
- Modify: `web/package.json`
- Create: `web/src/lib/redis.ts`

- [ ] **Step 1: Install Vercel AI SDK + Anthropic provider**

```bash
cd web && npm install ai @ai-sdk/anthropic zod
```

- [ ] **Step 2: Create `web/src/lib/redis.ts`**

```typescript
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(process.env.REDIS_URL || "redis://localhost:63790");

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export async function cacheGet(namespace: string, key: string): Promise<string | null> {
  const hash = Buffer.from(key).toString("base64url").slice(0, 24);
  return redis.get(`scout:${namespace}:${hash}`);
}

export async function cacheSet(namespace: string, key: string, value: string, ttlSeconds = 86400): Promise<void> {
  const hash = Buffer.from(key).toString("base64url").slice(0, 24);
  await redis.setex(`scout:${namespace}:${hash}`, ttlSeconds, value);
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web/ && git commit -m "feat: add Vercel AI SDK + Anthropic provider + Redis singleton"
```

---

## Task 2: Core Tools (gh_query, web_search, web_scrape)

**Files:**
- Create: `web/src/lib/tools/gh-query.ts`
- Create: `web/src/lib/tools/web-search.ts`
- Create: `web/src/lib/tools/web-scrape.ts`

- [ ] **Step 1: Create `web/src/lib/tools/gh-query.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";

const execFileAsync = promisify(execFile);

export const ghQueryTool = tool({
  description: "Query the GitHub REST API. Use for profiles, repos, events, READMEs, commits.",
  parameters: z.object({
    endpoint: z.string().describe("GitHub API path, e.g. /users/octocat"),
    jq_filter: z.string().optional().describe("Optional jq filter to apply"),
  }),
  execute: async ({ endpoint, jq_filter }, { abortSignal }) => {
    const cached = await cacheGet("gh", endpoint);
    if (cached) return cached;

    const args = ["api", endpoint, "--header", "Accept: application/vnd.github+json"];
    if (jq_filter) args.push("--jq", jq_filter);

    try {
      const { stdout, stderr } = await execFileAsync("gh", args, {
        timeout: 30000,
        signal: abortSignal,
      });

      if (stdout.trim()) {
        await cacheSet("gh", endpoint, stdout.trim(), 3600);

        // Side-effect: persist GitHub data
        try {
          const data = JSON.parse(stdout);
          await persistGhData(endpoint, data);
        } catch {}
      }

      return stdout.trim() || "(empty response)";
    } catch (e: any) {
      return `Error: ${e.message?.slice(0, 200)}`;
    }
  },
});

async function persistGhData(endpoint: string, data: any) {
  const loginMatch = endpoint.match(/\/users\/([^/]+)$/);
  if (loginMatch && typeof data === "object" && data.login) {
    await prisma.candidate.upsert({
      where: { login: data.login },
      create: {
        login: data.login,
        name: data.name,
        bio: data.bio,
        location: data.location,
        company: data.company,
        blog: data.blog,
        twitter: data.twitter_username,
        followers: data.followers ?? 0,
        publicRepos: data.public_repos ?? 0,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        githubCreatedAt: data.created_at ? new Date(data.created_at) : null,
      },
      update: {
        name: data.name,
        bio: data.bio,
        location: data.location,
        company: data.company,
        blog: data.blog,
        twitter: data.twitter_username,
        followers: data.followers ?? 0,
        publicRepos: data.public_repos ?? 0,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
      },
    });
  }
}
```

- [ ] **Step 2: Create `web/src/lib/tools/web-search.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import { cacheGet, cacheSet } from "@/lib/redis";

export const webSearchTool = tool({
  description: "Search Google for a person or topic. Returns titles, URLs, and snippets.",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().default(8).describe("Max results"),
  }),
  execute: async ({ query, limit }) => {
    const cached = await cacheGet("search", query);
    if (cached) return cached;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return "Error: FIRECRAWL_API_KEY not set";

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, limit }),
      });

      if (!res.ok) return `Search error: ${res.status} ${res.statusText}`;

      const json = await res.json();
      const results = json.data || [];
      const text = results
        .map((r: any) => `- ${r.title || ""}\n  ${r.url || ""}\n  ${(r.description || "").slice(0, 200)}`)
        .join("\n") || "No results found.";

      await cacheSet("search", query, text, 86400);
      return text;
    } catch (e: any) {
      return `Search error: ${e.message}`;
    }
  },
});
```

- [ ] **Step 3: Create `web/src/lib/tools/web-scrape.ts`**

```typescript
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";

export const webScrapeTool = tool({
  description: "Extract content from a URL as clean markdown. Good for blogs, personal sites, articles. Do NOT use on linkedin.com — use linkedin_lookup instead.",
  parameters: z.object({
    url: z.string().describe("URL to scrape"),
  }),
  execute: async ({ url }, { toolCallId }) => {
    const cached = await cacheGet("scrape", url);
    if (cached) return cached;

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return "Error: FIRECRAWL_API_KEY not set";

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });

      if (!res.ok) return `Scrape error: ${res.status} ${res.statusText}`;

      const json = await res.json();
      const content = json.data?.markdown || "";

      if (content.length >= 100) {
        await cacheSet("scrape", url, content.slice(0, 8000), 86400);
      }

      return content.slice(0, 8000) || "Could not extract content.";
    } catch (e: any) {
      return `Scrape error: ${e.message}`;
    }
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/tools/ && git commit -m "feat: core TS tools — gh_query, web_search, web_scrape"
```

---

## Task 3: LinkedIn + Subagent Tools + Index

**Files:**
- Create: `web/src/lib/tools/linkedin-lookup.ts`
- Create: `web/src/lib/tools/technical-assess.ts`
- Create: `web/src/lib/tools/legal-assess.ts`
- Create: `web/src/lib/tools/index.ts`

- [ ] **Step 1: Create `web/src/lib/tools/linkedin-lookup.ts`**

For now, a simplified version that searches Google for the LinkedIn URL and returns the search result (full Stagehand integration is a separate enhancement — keep it as a search-based lookup):

```typescript
import { tool } from "ai";
import { z } from "zod";

export const linkedinLookupTool = tool({
  description: "Search for a person's LinkedIn profile. Returns profile URL and any available info from search results.",
  parameters: z.object({
    name: z.string().describe("Person's full name"),
    company: z.string().optional().describe("Current or recent company"),
  }),
  execute: async ({ name, company }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return "Error: FIRECRAWL_API_KEY not set";

    const query = `"${name}" ${company ? `"${company}"` : ""} site:linkedin.com/in`.trim();

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, limit: 3 }),
      });

      if (!res.ok) return `LinkedIn search error: ${res.status}`;

      const json = await res.json();
      const results = json.data || [];
      if (results.length === 0) return "No LinkedIn profile found.";

      return results
        .map((r: any) => `${r.title || ""}\n${r.url || ""}\n${(r.description || "").slice(0, 300)}`)
        .join("\n\n");
    } catch (e: any) {
      return `LinkedIn lookup error: ${e.message}`;
    }
  },
});
```

- [ ] **Step 2: Create `web/src/lib/tools/technical-assess.ts`**

```typescript
import { tool, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { ghQueryTool } from "./gh-query";

const ASSESSOR_PROMPT = `You are a senior engineering technical assessor. Read actual code from the given repos and assess the developer's technical ability. Be FAST and FOCUSED — you have limited steps.

1. Get the file tree of ONE repo (the most interesting): gh_query endpoint="/repos/{owner}/{repo}/git/trees/HEAD?recursive=1" jq_filter=".tree[].path"
2. Read 2-3 key source files — entry points or core modules only
3. Check package.json/pyproject.toml for dependency choices

ASSESS: Code organization, framework choices, testing practices, engineering maturity (junior/mid/senior/staff). Be specific — cite files you read.`;

export const technicalAssessTool = tool({
  description: "Dispatch a subagent to read actual source code from repos and evaluate engineering ability. Use for interesting ORIGINAL (non-fork) repos.",
  parameters: z.object({
    login: z.string().describe("GitHub username"),
    repos: z.array(z.string()).describe("Repo names to assess (max 3)"),
  }),
  execute: async ({ login, repos }, { abortSignal }) => {
    const repoList = repos.slice(0, 3).map(r => `${login}/${r}`).join(", ");
    try {
      const { text } = await generateText({
        model: anthropic("claude-opus-4-7"),
        system: ASSESSOR_PROMPT,
        prompt: `Assess the technical ability of '${login}' by reading code from: ${repoList}`,
        tools: { gh_query: ghQueryTool },
        maxSteps: 8,
        abortSignal,
      });
      return text || "Assessment could not be completed.";
    } catch (e: any) {
      if (e.name === "AbortError") return "Assessment aborted.";
      return `Assessment error: ${e.message}`;
    }
  },
});
```

- [ ] **Step 3: Create `web/src/lib/tools/legal-assess.ts`**

```typescript
import { tool, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { ghQueryTool } from "./gh-query";
import { webSearchTool } from "./web-search";

const LEGAL_PROMPT = `You are a legal-tech industry analyst. Assess a developer's connection to the legal technology space. Be FAST — max 2 web searches.

Check: direct legal-tech work, employer in legal space, adjacent skills (NLP, compliance, gov-tech), why they forked an AI legal platform.

Rate: Deep / Adjacent / Transferable / None. Provide specific evidence.`;

export const legalAssessTool = tool({
  description: "Investigate a candidate's connection to the legal/legal-tech industry.",
  parameters: z.object({
    login: z.string().describe("GitHub username"),
    context: z.string().optional().describe("What you already know: name, company, bio"),
  }),
  execute: async ({ login, context }, { abortSignal }) => {
    try {
      const { text } = await generateText({
        model: anthropic("claude-opus-4-7"),
        system: LEGAL_PROMPT,
        prompt: `Assess legal-tech relevance for '${login}'. Context: ${context || "none"}`,
        tools: { gh_query: ghQueryTool, web_search: webSearchTool },
        maxSteps: 8,
        abortSignal,
      });
      return text || "Could not assess legal relevance.";
    } catch (e: any) {
      if (e.name === "AbortError") return "Assessment aborted.";
      return `Legal assessment error: ${e.message}`;
    }
  },
});
```

- [ ] **Step 4: Create `web/src/lib/tools/index.ts`**

```typescript
import { ghQueryTool } from "./gh-query";
import { webSearchTool } from "./web-search";
import { webScrapeTool } from "./web-scrape";
import { linkedinLookupTool } from "./linkedin-lookup";
import { technicalAssessTool } from "./technical-assess";
import { legalAssessTool } from "./legal-assess";

export const enrichmentTools = {
  gh_query: ghQueryTool,
  web_search: webSearchTool,
  web_scrape: webScrapeTool,
  linkedin_lookup: linkedinLookupTool,
  technical_assess: technicalAssessTool,
  legal_relevance_assess: legalAssessTool,
};

export const ENRICHMENT_SYSTEM_PROMPT = `You are a talent research agent investigating a developer who forked an AI legal platform (willchen96/mike on GitHub).

You have 6 tools: gh_query, web_search, web_scrape, linkedin_lookup, technical_assess, legal_relevance_assess.

WORKFLOW:
1. Pull their GitHub profile, starred repos, recent repos, and activity
2. Investigate their fork of willchen96/mike — check for own commits
3. Based on what you find, search the web intelligently
4. If they have a blog/personal site, scrape it
5. ALWAYS run legal_relevance_assess
6. If interesting original repos exist, run technical_assess on the best 1-2
7. Provide a comprehensive summary

RULES:
- Think out loud — explain what you're doing and why
- NEVER use web_scrape on linkedin.com — use linkedin_lookup instead
- Compound your knowledge — each finding should inform the next search
- Quality over quantity — 3 good findings beat 10 empty results
- If their GitHub is sparse (no name, no bio, all forks), note it and wrap up quickly`;
```

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/tools/ && git commit -m "feat: linkedin, subagent, and index — complete TS tool suite"
```

---

## Task 4: API Route + Client Component Rewrite

**Files:**
- Rewrite: `web/src/app/api/enrich/[login]/route.ts`
- Rewrite: `web/src/components/enrich-stream.tsx`
- Modify: `web/src/components/detail-with-enrich.tsx`

- [ ] **Step 1: Rewrite `web/src/app/api/enrich/[login]/route.ts`**

Replace the `exec()` subprocess approach with `streamText`:

```typescript
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichmentTools, ENRICHMENT_SYSTEM_PROMPT } from "@/lib/tools";

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { login } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const result = streamText({
    model: anthropic("claude-opus-4-7"),
    system: ENRICHMENT_SYSTEM_PROMPT,
    prompt: `Research the GitHub developer '${login}' who forked willchen96/mike (an AI legal platform). Start by pulling their GitHub data, then use what you find to search the web for their professional presence. Think out loud.`,
    tools: enrichmentTools,
    maxSteps: 25,
    abortSignal: request.signal,
    onStepFinish: async ({ text, toolCalls, toolResults }) => {
      for (const tc of toolCalls) {
        const tr = toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
        await prisma.enrichmentLog.create({
          data: {
            candidateLogin: login,
            tool: tc.toolName,
            input: tc.args as any,
            output: { result: typeof tr?.result === "string" ? tr.result.slice(0, 2000) : "ok" },
            createdAt: new Date(),
          },
        }).catch(() => {});
      }
    },
  });

  return result.toTextStreamResponse();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const [logCount, repoCount, profileCount] = await Promise.all([
    prisma.enrichmentLog.count({ where: { candidateLogin: login } }),
    prisma.repo.count({ where: { candidateLogin: login } }),
    prisma.profile.count({ where: { candidateLogin: login } }),
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
    toolCalls: logCount,
    recentLogs,
  });
}
```

- [ ] **Step 2: Rewrite `web/src/components/enrich-stream.tsx`**

Replace the EventSource approach with fetch + ReadableStream to parse the AI SDK text stream:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type StreamEvent = {
  type: "reasoning" | "tool_call" | "done" | "error";
  text?: string;
  toolName?: string;
  args?: any;
};

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [chunks, setChunks] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<{ name: string; args: string }[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        const response = await fetch(`/api/enrich/${login}`, {
          method: "POST",
          signal: controller.signal,
        });

        setStatus("streaming");
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // The AI SDK text stream sends plain text (reasoning) interspersed with
          // tool call markers. We accumulate text chunks for display.
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            // AI SDK text stream protocol: lines starting with specific prefixes
            // For streamText, text comes as raw content
            if (line.startsWith("0:")) {
              // Text delta — JSON-encoded string
              try {
                const text = JSON.parse(line.slice(2));
                if (text) setChunks(prev => [...prev, text]);
              } catch {}
            } else if (line.startsWith("9:")) {
              // Tool call
              try {
                const data = JSON.parse(line.slice(2));
                if (data?.toolName) {
                  setToolCalls(prev => [...prev, {
                    name: data.toolName,
                    args: JSON.stringify(data.args || {}).slice(0, 100),
                  }]);
                }
              } catch {}
            } else if (line.startsWith("e:")) {
              // Finish
              setStatus("done");
            } else if (line.startsWith("d:")) {
              // Done signal
              setStatus("done");
            }
          }
        }

        setStatus("done");
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setChunks(prev => [...prev, `\n\n**Error:** ${e.message}`]);
        }
        setStatus("done");
      }

      setTimeout(() => {
        router.refresh();
        onDone();
      }, 2000);
    };

    run();
    return () => controller.abort();
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks, toolCalls]);

  const abort = () => {
    abortRef.current?.abort();
    setStatus("done");
    setChunks(prev => [...prev, "\n\n*Aborted by user.*"]);
  };

  const fullText = chunks.join("");

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
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toolCalls.length} tools</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>

        {status === "streaming" && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>● Live</span>
            <button
              onClick={abort}
              style={{
                appearance: "none", border: "1px solid color-mix(in oklab, #dc2626, transparent 60%)",
                background: "color-mix(in oklab, #dc2626, transparent 94%)", color: "#dc2626",
                borderRadius: "var(--radius-DEFAULT)", padding: "2px 8px",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
            >
              ■ Stop
            </button>
          </span>
        )}
        {status === "done" && (
          <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 500 }}>✓ Complete</span>
        )}
      </div>

      {/* Content: agent reasoning as markdown + tool calls inline */}
      <div ref={scrollRef} style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {/* Tool call log */}
        {toolCalls.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {toolCalls.map((tc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "3px 14px", fontSize: 11.5,
                fontFamily: "var(--font-geist-mono)", color: "var(--color-fg-muted)",
              }}>
                <span style={{ color: "#16a34a" }}>✓</span>
                <span style={{ fontWeight: 500 }}>{tc.name}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.args}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent reasoning as markdown */}
        {fullText && (
          <div style={{
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)",
            padding: "14px 18px", fontSize: 13, lineHeight: 1.55,
          }}>
            <Markdown remarkPlugins={[remarkGfm]}>{fullText}</Markdown>
          </div>
        )}

        {status === "connecting" && (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: 20, textAlign: "center" }}>
            Starting enrichment agent...
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web/src/ && git commit -m "feat: TS enrichment agent — streamText with abort + streaming UI"
```

---

## Verification Checklist

- [ ] **1.** Build passes: `cd web && npm run build`
- [ ] **2.** Start dev: `npm run dev`, open a candidate detail page
- [ ] **3.** Click "▸ Enrich with agent" → main content shows streaming markdown + tool calls
- [ ] **4.** Click "■ Stop" mid-stream → stream stops immediately, "Aborted by user" shows, page refreshes
- [ ] **5.** `EnrichmentLog` has entries: `psql ... -c 'SELECT tool, COUNT(*) FROM "EnrichmentLog" GROUP BY tool'`
- [ ] **6.** CLI still works independently: `mise run enrich -- --login someuser` (Python agent)
