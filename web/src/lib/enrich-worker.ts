import { streamText, generateObject, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { clearActiveJob } from "./queue";
import { enrichmentTools, ENRICHMENT_SYSTEM_PROMPT } from "./tools";

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
  openToWork: z.enum(["yes", "no", "unknown"]),
  isLawyer: z.enum(["yes", "no", "unknown"]),
  hasOwnCompany: z.enum(["yes", "no", "unknown"]),
  companyName: z.string().nullable(),
  aiExperience: z.enum(["none", "basic", "intermediate", "advanced", "unknown"]),
  legalTechRelevance: z.enum(["deep", "adjacent", "transferable", "none", "unknown"]),
  communityActivity: z.enum(["none", "low", "moderate", "high", "unknown"]),
  influenceLevel: z.enum(["none", "emerging", "established", "notable", "unknown"]),
  linkedin: z.object({
    profileUrl: z.string().nullable(),
    headline: z.string().nullable(),
    currentTitle: z.string().nullable(),
    currentCompany: z.string().nullable(),
    location: z.string().nullable(),
    connectionCount: z.number().nullable(),
    experience: z.string().nullable(),
    education: z.string().nullable(),
    skills: z.string().nullable(),
    certifications: z.string().nullable(),
    recentActivity: z.string().nullable(),
  }).nullable(),
  webMentions: z.array(z.object({
    url: z.string(),
    title: z.string().nullable(),
    snippet: z.string(),
    source: z.enum(["blog", "company", "conference", "social", "portfolio", "news", "other"]),
  })),
});

function pub(login: string, event: string, data: Record<string, unknown> = {}) {
  redis.publish(`scout:enrich:${login}`, JSON.stringify({ event, ...data }));
}

export async function runEnrichment(login: string) {
  const emittedCards = new Set<string>();

  const result = streamText({
    model: anthropic("claude-opus-4-6"),
    system: ENRICHMENT_SYSTEM_PROMPT,
    prompt: `Research the GitHub developer '${login}' who forked willchen96/mike (an AI legal platform). Start by pulling their GitHub data, then use what you find to search the web for their professional presence.`,
    tools: enrichmentTools,
    stopWhen: stepCountIs(25),
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

  let narrativeText = "";

  try {
    let stepCount = 0;
    for await (const chunk of result.fullStream) {
      switch (chunk.type) {
        case "start-step":
          if (stepCount > 0) {
            pub(login, "sep");
            narrativeText += "\n\n";
          }
          stepCount++;
          break;
        case "text-delta": {
          const text = (chunk as any).text ?? (chunk as any).textDelta ?? "";
          if (text) {
            pub(login, "text", { text });
            narrativeText += text;
          }
          break;
        }
        case "tool-call":
          pub(login, "tool-start", {
            tool: (chunk as any).toolName,
            args: JSON.stringify((chunk as any).input ?? {}).slice(0, 120),
          });
          break;
        case "tool-result": {
          const toolName = (chunk as any).toolName ?? "";
          const output = typeof (chunk as any).output === "string" ? (chunk as any).output : JSON.stringify((chunk as any).output ?? "");
          pub(login, "tool-end", { tool: toolName });
          const cards = await cardsFromToolResult(login, toolName, output, emittedCards);
          for (const c of cards) {
            pub(login, "card", c);
          }
          break;
        }
        case "finish": {
          const narrative = narrativeText.trim();
          if (narrative) {
            await prisma.enrichmentLog.create({
              data: { candidateLogin: login, tool: "__narrative__", input: {}, output: { text: narrative }, createdAt: new Date() },
            }).catch(() => {});

            pub(login, "tool-start", { tool: "analyze", args: "extracting fit, signals, skills, linkedin, web mentions..." });

            try {
              await runAnalysis(login, narrative);
            } catch (e: any) {
              console.error("[analyze] Failed:", e.message);
            }

            pub(login, "tool-end", { tool: "analyze" });
          }

          await prisma.crm.upsert({
            where: { candidateLogin: login },
            create: { candidateLogin: login, status: "enriched" },
            update: {},
          }).then(crm => {
            if (crm.status === "new") {
              return prisma.crm.update({ where: { id: crm.id }, data: { status: "enriched" } });
            }
          }).catch(() => {});

          pub(login, "done");
          break;
        }
      }
    }
  } catch (e: any) {
    console.error(`[enrich-worker] ${login} error:`, e.message, e.stack?.slice(0, 300));
    pub(login, "text", { text: `\n\n**Enrichment error:** ${e.message}\n` });
    pub(login, "done");
  } finally {
    await clearActiveJob(login);
  }
}

async function cardsFromToolResult(login: string, toolName: string, output: string, emittedCards: Set<string>) {
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

      const profileDepth = [data.name, data.bio, data.blog, data.twitter_username, data.company].filter(Boolean).length;
      const repoCount = data.public_repos ?? 0;
      const followers = data.followers ?? 0;
      const accountAge = data.created_at ? Math.max(0, new Date().getFullYear() - new Date(data.created_at).getFullYear()) : 0;
      const signals = [
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
          name: data.name || undefined, email: data.email || undefined,
          bio: data.bio || undefined, location: data.location || undefined,
          company: data.company || undefined, blog: data.blog || undefined,
          twitter: data.twitter_username || undefined,
          followers: data.followers ?? undefined, publicRepos: data.public_repos ?? undefined,
          avatarUrl: data.avatar_url || undefined, htmlUrl: data.html_url || undefined,
          hireable: data.hireable ?? undefined,
          githubCreatedAt: data.created_at ? new Date(data.created_at) : undefined,
        },
      }).catch(() => {});
    }

    if (toolName === "gh_query" && Array.isArray(data) && !emittedCards.has("RepoCards")) {
      emittedCards.add("RepoCards");
      for (const r of data.filter((r: any) => r.name && r.full_name).slice(0, 5)) {
        cards.push({ card: "RepoCard", props: {
          name: r.name, language: r.language ?? null,
          stars: r.stargazers_count ?? 0, description: r.description ?? null,
          url: r.html_url ?? null,
        }});
      }
      for (const r of data.filter((r: any) => r.name && r.full_name)) {
        const exists = await prisma.repo.findFirst({ where: { candidateLogin: login, name: r.name } });
        if (exists) {
          await prisma.repo.update({ where: { id: exists.id }, data: {
            description: r.description, language: r.language,
            stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0,
            pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
          }}).catch(() => {});
        } else {
          await prisma.repo.create({ data: {
            candidateLogin: login, name: r.name, htmlUrl: r.html_url ?? "",
            description: r.description, language: r.language,
            stars: r.stargazers_count ?? 0, forks: r.forks_count ?? 0,
            isFork: r.fork ?? false, pushedAt: r.pushed_at ? new Date(r.pushed_at) : null,
          }}).catch(() => {});
        }
      }
    }
  } catch {}
  return cards;
}

async function runAnalysis(login: string, narrative: string) {
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
    model: anthropic("claude-opus-4-6"),
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
      `Top-line categories:`,
      `- openToWork: look for "open to work" badges, "looking for opportunities", "available for hire" signals`,
      `- isLawyer: are they a lawyer, attorney, JD, bar-admitted, or legal professional?`,
      `- hasOwnCompany: did they found, co-found, or run their own company? companyName: what is it called?`,
      `- aiExperience: none=no AI work, basic=uses AI APIs, intermediate=builds AI features, advanced=ML research/models`,
      `- legalTechRelevance: deep=works in legal tech, adjacent=compliance/gov-tech/NLP, transferable=relevant skills, none=no connection`,
      `- communityActivity: based on OSS contributions, blog posts, conference talks, SO answers, published packages`,
      `- influenceLevel: none=invisible, emerging=some followers/posts, established=known in niche, notable=significant following/leadership`,
      ``,
      `- linkedin: extract LinkedIn profile data. Set to null if no LinkedIn data in the report.`,
      `- webMentions: extract URLs found — blogs, company sites, portfolios. Do NOT include github.com or linkedin.com URLs.`,
    ].join("\n"),
  });

  const profileData = {
    summary: analysis.summary, fitScore: analysis.fitScore,
    fitReasoning: analysis.fitReasoning, seniority: analysis.seniority,
    recommendedOutreach: analysis.recommendedOutreach, outreachReason: analysis.outreachReason,
    confidence: analysis.confidence, openToWork: analysis.openToWork,
    isLawyer: analysis.isLawyer, hasOwnCompany: analysis.hasOwnCompany,
    companyName: analysis.companyName, aiExperience: analysis.aiExperience,
    legalTechRelevance: analysis.legalTechRelevance, communityActivity: analysis.communityActivity,
    influenceLevel: analysis.influenceLevel, model: "claude-opus-4-6",
    rawJson: JSON.stringify(analysis),
  };

  await prisma.$transaction(async (tx) => {
    await tx.profile.upsert({
      where: { candidateLogin: login },
      create: { candidateLogin: login, ...profileData },
      update: { ...profileData, generatedAt: new Date() },
    });
    await tx.signal.deleteMany({ where: { candidateLogin: login } });
    for (const s of analysis.signals) await tx.signal.create({ data: { candidateLogin: login, kind: s.kind, text: s.text } });
    await tx.skill.deleteMany({ where: { candidateLogin: login } });
    for (const name of analysis.skills) await tx.skill.create({ data: { candidateLogin: login, name } });
    if (analysis.linkedin) {
      const li = analysis.linkedin;
      await tx.linkedInProfile.upsert({
        where: { candidateLogin: login },
        create: { candidateLogin: login, profileUrl: li.profileUrl, headline: li.headline, currentTitle: li.currentTitle, currentCompany: li.currentCompany, location: li.location, connectionCount: li.connectionCount, experience: li.experience, education: li.education, skills: li.skills, certifications: li.certifications, recentActivity: li.recentActivity },
        update: { profileUrl: li.profileUrl, headline: li.headline, currentTitle: li.currentTitle, currentCompany: li.currentCompany, location: li.location, connectionCount: li.connectionCount, experience: li.experience, education: li.education, skills: li.skills, certifications: li.certifications, recentActivity: li.recentActivity, scrapedAt: new Date() },
      });
    }
    if (analysis.webMentions.length > 0) {
      await tx.webMention.deleteMany({ where: { candidateLogin: login } });
      for (const wm of analysis.webMentions) await tx.webMention.create({ data: { candidateLogin: login, url: wm.url, title: wm.title, snippet: wm.snippet ?? "", source: wm.source } });
    }
  });
}
