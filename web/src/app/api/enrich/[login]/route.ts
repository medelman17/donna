import { streamText, stepCountIs } from "ai";
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
    prompt: `Research the GitHub developer '${login}' who forked willchen96/mike (an AI legal platform). Start by pulling their GitHub data, then use what you find to search the web for their professional presence.`,
    tools: enrichmentTools,
    stopWhen: stepCountIs(25),
    abortSignal: request.signal,
    onStepFinish: async ({ toolCalls, toolResults }) => {
      for (const tc of toolCalls) {
        const tr = toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
        await prisma.enrichmentLog.create({
          data: {
            candidateLogin: login,
            tool: tc.toolName,
            input: (tc as any).input ?? {},
            output: { result: typeof (tr as any)?.output === "string" ? (tr as any).output.slice(0, 2000) : "ok" },
            createdAt: new Date(),
          },
        }).catch(() => {});
      }
    },
  });

  const encoder = new TextEncoder();
  const emittedCards = new Set<string>();

  function sse(event: string, data: unknown) {
    return encoder.encode(`data: ${JSON.stringify({ event, ...data as any })}\n\n`);
  }

  async function cardsFromToolResult(toolName: string, output: string): Promise<Array<{ card: string; props: Record<string, unknown> }>> {
    const cards: Array<{ card: string; props: Record<string, unknown> }> = [];
    try {
      const data = JSON.parse(output);

      if (toolName === "gh_query" && data.login && data.avatar_url && !emittedCards.has("ProfileHeader")) {
        emittedCards.add("ProfileHeader");
        cards.push({ card: "ProfileHeader", props: {
          name: data.name ?? null, login: data.login,
          avatar: data.avatar_url, bio: data.bio ?? null,
          location: data.location ?? null, company: data.company ?? null,
        }});
        const metrics: { label: string; value: string; sub?: string }[] = [];
        if (data.public_repos != null) metrics.push({ label: "Public Repos", value: String(data.public_repos) });
        if (data.followers != null) metrics.push({ label: "Followers", value: String(data.followers) });
        if (data.following != null) metrics.push({ label: "Following", value: String(data.following) });
        if (data.created_at) {
          const yr = new Date(data.created_at).getFullYear();
          const age = new Date().getFullYear() - yr;
          metrics.push({ label: "Account Age", value: age > 0 ? `~${age} yrs` : "<1 yr", sub: `since ${yr}` });
        }
        if (data.twitter_username) metrics.push({ label: "Twitter", value: `@${data.twitter_username}` });
        if (metrics.length) cards.push({ card: "MetricGrid", props: { metrics } });

        // Triage scoring
        const profileDepth = [data.name, data.bio, data.blog, data.twitter_username, data.company].filter(Boolean).length;
        const repoCount = data.public_repos ?? 0;
        const followers = data.followers ?? 0;
        const accountAge = data.created_at ? Math.max(0, new Date().getFullYear() - new Date(data.created_at).getFullYear()) : 0;

        const signals: { dimension: string; score: number; max: number; detail: string }[] = [
          { dimension: "Profile Depth", score: profileDepth, max: 5, detail: [data.name && "name", data.bio && "bio", data.blog && "blog", data.twitter_username && "twitter", data.company && "company"].filter(Boolean).join(", ") || "empty" },
          { dimension: "Repo Volume", score: Math.min(5, Math.floor(repoCount / 3)), max: 5, detail: `${repoCount} public repos` },
          { dimension: "Social Signal", score: Math.min(5, followers < 2 ? 0 : followers < 10 ? 1 : followers < 50 ? 2 : followers < 200 ? 3 : followers < 1000 ? 4 : 5), max: 5, detail: `${followers} followers` },
          { dimension: "Account Age", score: Math.min(5, accountAge), max: 5, detail: accountAge > 0 ? `~${accountAge} yrs` : "< 1 yr" },
        ];

        const totalScore = signals.reduce((s, d) => s + d.score, 0);
        const verdict = totalScore < 4 ? "SKIP" : totalScore < 8 ? "LIGHT" : "INVESTIGATE";

        cards.push({ card: "TriageCard", props: { signals, totalScore, maxScore: 20, verdict } });

        await prisma.candidate.update({
          where: { login },
          data: {
            name: data.name || undefined,
            bio: data.bio || undefined,
            location: data.location || undefined,
            company: data.company || undefined,
            blog: data.blog || undefined,
            twitter: data.twitter_username || undefined,
            followers: data.followers ?? undefined,
            publicRepos: data.public_repos ?? undefined,
            avatarUrl: data.avatar_url || undefined,
            htmlUrl: data.html_url || undefined,
            hireable: data.hireable ?? undefined,
            githubCreatedAt: data.created_at ? new Date(data.created_at) : undefined,
          },
        }).catch(() => {});
      }

      if (toolName === "gh_query" && Array.isArray(data) && !emittedCards.has("RepoCards")) {
        emittedCards.add("RepoCards");
        const repos = data.filter((r: any) => r.name && r.full_name).slice(0, 5);
        for (const r of repos) {
          cards.push({ card: "RepoCard", props: {
            name: r.name, language: r.language ?? null,
            stars: r.stargazers_count ?? 0,
            description: r.description ?? null,
            url: r.html_url ?? null,
          }});
        }

        const allRepos = data.filter((r: any) => r.name && r.full_name);
        for (const r of allRepos) {
          const exists = await prisma.repo.findFirst({
            where: { candidateLogin: login, name: r.name },
          });
          if (exists) {
            await prisma.repo.update({
              where: { id: exists.id },
              data: {
                description: r.description, language: r.language,
                stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0,
                pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
              },
            }).catch(() => {});
          } else {
            await prisma.repo.create({
              data: {
                candidateLogin: login, name: r.name,
                htmlUrl: r.html_url ?? "", description: r.description,
                language: r.language, stars: r.stargazers_count ?? 0,
                forks: r.forks_count ?? 0, isFork: r.fork ?? false,
                pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
              },
            }).catch(() => {});
          }
        }
      }
    } catch {}
    return cards;
  }

  const stream = new ReadableStream({
    async start(controller) {
      let narrativeText = "";
      try {
        let stepCount = 0;
        for await (const chunk of result.fullStream) {
          switch (chunk.type) {
            case "start-step":
              if (stepCount > 0) {
                controller.enqueue(sse("sep", {}));
                narrativeText += "\n\n";
              }
              stepCount++;
              break;
            case "text-delta": {
              const text = (chunk as any).text ?? (chunk as any).textDelta ?? "";
              if (text) {
                controller.enqueue(sse("text", { text }));
                narrativeText += text;
              }
              break;
            }
            case "tool-call":
              controller.enqueue(sse("tool-start", {
                tool: (chunk as any).toolName,
                args: JSON.stringify((chunk as any).input ?? {}).slice(0, 120),
              }));
              break;
            case "tool-result": {
              const toolName = (chunk as any).toolName ?? "";
              const output = typeof (chunk as any).output === "string" ? (chunk as any).output : JSON.stringify((chunk as any).output ?? "");
              controller.enqueue(sse("tool-end", { tool: toolName }));
              const cards = await cardsFromToolResult(toolName, output);
              for (const c of cards) {
                controller.enqueue(sse("card", c));
              }
              break;
            }
            case "finish":
              if (narrativeText.trim()) {
                await prisma.enrichmentLog.create({
                  data: {
                    candidateLogin: login,
                    tool: "__narrative__",
                    input: {},
                    output: { text: narrativeText.trim() },
                    createdAt: new Date(),
                  },
                }).catch(() => {});
              }
              controller.enqueue(sse("done", {}));
              break;
          }
        }
      } catch (e: any) {
        if (e.name !== "AbortError") {
          controller.enqueue(sse("done", {}));
        }
      } finally {
        controller.close();
      }
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
