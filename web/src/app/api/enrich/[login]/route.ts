import { streamText, generateObject, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichmentTools, ENRICHMENT_SYSTEM_PROMPT } from "@/lib/tools";

const analysisSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of the candidate's background and relevance"),
  fitScore: z.number().int().min(1).max(5).describe("1=no fit, 2=poor, 3=moderate, 4=good, 5=excellent"),
  fitReasoning: z.string().describe("Paragraph explaining the fit score with specific evidence"),
  seniority: z.enum(["junior", "mid", "senior", "staff", "unknown"]),
  recommendedOutreach: z.enum(["yes", "no", "maybe"]),
  outreachReason: z.string().describe("One sentence explaining the outreach recommendation"),
  confidence: z.number().min(0).max(1).describe("How confident you are in this assessment"),
  signals: z.array(z.object({
    kind: z.enum(["positive", "negative", "notable"]),
    text: z.string().describe("Concise signal description, one sentence"),
  })),
  skills: z.array(z.string().describe("Specific technology or tool name")),
  openToWork: z.enum(["yes", "no", "unknown"]).describe("Whether they appear to be actively looking for work — check LinkedIn status, bio, recent activity"),
  isLawyer: z.enum(["yes", "no", "unknown"]).describe("Whether they are a lawyer, attorney, or legal professional"),
  hasOwnCompany: z.enum(["yes", "no", "unknown"]).describe("Whether they founded or run their own company"),
  companyName: z.string().nullable().describe("Name of their company if they have one, or current employer"),
  aiExperience: z.enum(["none", "basic", "intermediate", "advanced", "unknown"]).describe("Level of AI/ML experience based on repos, skills, and projects"),
  legalTechRelevance: z.enum(["deep", "adjacent", "transferable", "none", "unknown"]).describe("Connection to legal tech — deep=works in legal tech, adjacent=related field, transferable=relevant skills"),
  communityActivity: z.enum(["none", "low", "moderate", "high", "unknown"]).describe("How active they are in developer communities — OSS contributions, blog posts, talks, SO answers"),
  influenceLevel: z.enum(["none", "emerging", "established", "notable", "unknown"]).describe("Sphere of influence — followers, published packages, conference talks, community leadership"),
  linkedin: z.object({
    profileUrl: z.string().nullable().describe("LinkedIn profile URL if found"),
    headline: z.string().nullable().describe("LinkedIn headline"),
    currentTitle: z.string().nullable().describe("Current job title"),
    currentCompany: z.string().nullable().describe("Current employer"),
    location: z.string().nullable().describe("Location from LinkedIn"),
    connectionCount: z.number().nullable().describe("Number of connections if mentioned"),
    experience: z.string().nullable().describe("Formatted work history: 'Title at Company (duration)' entries, newline-separated"),
    education: z.string().nullable().describe("Formatted education: 'Degree, Field at School' entries, newline-separated"),
    skills: z.string().nullable().describe("Comma-separated LinkedIn skills if listed"),
    certifications: z.string().nullable().describe("Comma-separated certifications if listed"),
    recentActivity: z.string().nullable().describe("Summary of recent LinkedIn posts/activity — what topics they post about (legal tech, coding, AI, career, etc.)"),
  }).nullable().describe("LinkedIn profile data — null if no LinkedIn info found in the report"),
  webMentions: z.array(z.object({
    url: z.string(),
    title: z.string().nullable(),
    snippet: z.string().describe("Brief description of what was found at this URL"),
    source: z.enum(["blog", "company", "conference", "social", "portfolio", "news", "other"]),
  })).describe("Notable web pages found during research — blogs, company pages, talks, portfolios"),
});

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
            case "finish": {
              const narrative = narrativeText.trim();
              if (narrative) {
                await prisma.enrichmentLog.create({
                  data: {
                    candidateLogin: login,
                    tool: "__narrative__",
                    input: {},
                    output: { text: narrative },
                    createdAt: new Date(),
                  },
                }).catch(() => {});

                controller.enqueue(sse("tool-start", { tool: "analyze", args: "extracting fit, signals, skills, linkedin, web mentions..." }));

                try {
                  const [settingsRows, jobPositions, hiringPrefs] = await Promise.all([
                    prisma.setting.findMany({ where: { key: "company_description" } }),
                    prisma.jobPosition.findMany({ orderBy: { createdAt: "asc" } }),
                    prisma.hiringPreference.findMany({ orderBy: { weight: "desc" } }),
                  ]);

                  const companyDesc = settingsRows[0]?.value;
                  const weightLabel = (w: number) => w >= 3 ? "HIGH" : w >= 2 ? "MEDIUM" : "LOW";
                  const companyBlock = [
                    companyDesc && `Company: ${companyDesc}`,
                    jobPositions.length > 0 && `Open Positions:\n${jobPositions.map(p => `${p.title}: ${p.description}`).join("\n\n")}`,
                    hiringPrefs.length > 0 && `Hiring Preferences:\n${hiringPrefs.map(p => `[${weightLabel(p.weight)}] ${p.tag}: ${p.description}`).join("\n")}`,
                  ].filter(Boolean).join("\n\n");

                  const { object: analysis } = await generateObject({
                    model: anthropic("claude-sonnet-4-6"),
                    schema: analysisSchema,
                    prompt: [
                      `Analyze this talent research report and extract a structured assessment.`,
                      companyBlock && `\n${companyBlock}`,
                      `\nCandidate GitHub login: ${login}\n\nResearch Report:\n${narrative}`,
                    ].filter(Boolean).join("\n"),
                    system: [
                      `You are a talent analysis agent. Extract a structured assessment from the research report provided.`,
                      companyBlock ? `Score fitScore relative to the company and its open positions described in the prompt.` : `Score fitScore relative to hiring for an AI legal platform engineering team.`,
                      `Scoring guide:`,
                      `- fitScore: 1=no fit (ghost/empty account), 2=poor fit (no relevant skills), 3=moderate (some relevant experience), 4=good fit (strong relevant skills), 5=excellent (ideal candidate)`,
                      `- seniority: based on evidence of experience, code quality, project scope`,
                      `- confidence: how much evidence the report contains (0.3 for sparse, 0.7+ for thorough)`,
                      `- signals: be specific and evidence-based, cite repos/projects/findings from the report`,
                      `- skills: extract specific technologies, languages, frameworks mentioned — not soft skills`,
                      ``,
                      `Top-line categories (answer based on evidence in the report):`,
                      `- openToWork: look for "open to work" badges, "looking for opportunities", "available for hire" signals`,
                      `- isLawyer: are they a lawyer, attorney, JD, bar-admitted, or legal professional?`,
                      `- hasOwnCompany: did they found, co-found, or run their own company? companyName: what is it called?`,
                      `- aiExperience: none=no AI work, basic=uses AI APIs, intermediate=builds AI features, advanced=ML research/models`,
                      `- legalTechRelevance: deep=works in legal tech, adjacent=compliance/gov-tech/NLP, transferable=relevant skills, none=no connection`,
                      `- communityActivity: based on OSS contributions, blog posts, conference talks, SO answers, published packages`,
                      `- influenceLevel: none=invisible, emerging=some followers/posts, established=known in niche, notable=significant following/leadership`,
                      ``,
                      `- linkedin: extract any LinkedIn profile data mentioned (URL, headline, title, company, connections, experience, education, skills, recent post topics). Set to null if no LinkedIn data in the report.`,
                      `- webMentions: extract URLs the agent visited or found — personal blogs, company sites, portfolio pages, conference talks, articles. Include the URL, page title, and a brief snippet of what was found. Do NOT include github.com or linkedin.com URLs here.`,
                    ].join("\n"),
                  });

                  const profileData = {
                    summary: analysis.summary,
                    fitScore: analysis.fitScore,
                    fitReasoning: analysis.fitReasoning,
                    seniority: analysis.seniority,
                    recommendedOutreach: analysis.recommendedOutreach,
                    outreachReason: analysis.outreachReason,
                    confidence: analysis.confidence,
                    openToWork: analysis.openToWork,
                    isLawyer: analysis.isLawyer,
                    hasOwnCompany: analysis.hasOwnCompany,
                    companyName: analysis.companyName,
                    aiExperience: analysis.aiExperience,
                    legalTechRelevance: analysis.legalTechRelevance,
                    communityActivity: analysis.communityActivity,
                    influenceLevel: analysis.influenceLevel,
                    model: "claude-sonnet-4-6",
                    rawJson: JSON.stringify(analysis),
                  };

                  await prisma.$transaction(async (tx) => {
                    await tx.profile.upsert({
                      where: { candidateLogin: login },
                      create: { candidateLogin: login, ...profileData },
                      update: { ...profileData, generatedAt: new Date() },
                    });

                    await tx.signal.deleteMany({ where: { candidateLogin: login } });
                    for (const s of analysis.signals) {
                      await tx.signal.create({ data: { candidateLogin: login, kind: s.kind, text: s.text } });
                    }

                    await tx.skill.deleteMany({ where: { candidateLogin: login } });
                    for (const name of analysis.skills) {
                      await tx.skill.create({ data: { candidateLogin: login, name } });
                    }

                    if (analysis.linkedin) {
                      const li = analysis.linkedin;
                      await tx.linkedInProfile.upsert({
                        where: { candidateLogin: login },
                        create: {
                          candidateLogin: login,
                          profileUrl: li.profileUrl,
                          headline: li.headline,
                          currentTitle: li.currentTitle,
                          currentCompany: li.currentCompany,
                          location: li.location,
                          connectionCount: li.connectionCount,
                          experience: li.experience,
                          education: li.education,
                          skills: li.skills,
                          certifications: li.certifications,
                          recentActivity: li.recentActivity,
                        },
                        update: {
                          profileUrl: li.profileUrl,
                          headline: li.headline,
                          currentTitle: li.currentTitle,
                          currentCompany: li.currentCompany,
                          location: li.location,
                          connectionCount: li.connectionCount,
                          experience: li.experience,
                          education: li.education,
                          skills: li.skills,
                          certifications: li.certifications,
                          recentActivity: li.recentActivity,
                          scrapedAt: new Date(),
                        },
                      });
                    }

                    if (analysis.webMentions.length > 0) {
                      await tx.webMention.deleteMany({ where: { candidateLogin: login } });
                      for (const wm of analysis.webMentions) {
                        await tx.webMention.create({
                          data: {
                            candidateLogin: login,
                            url: wm.url,
                            title: wm.title,
                            snippet: wm.snippet ?? "",
                            source: wm.source,
                          },
                        });
                      }
                    }
                  });
                } catch (e: any) {
                  console.error("[analyze] Failed to generate analysis:", e.message);
                }

                controller.enqueue(sse("tool-end", { tool: "analyze" }));
              }
              controller.enqueue(sse("done", {}));
              break;
            }
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
