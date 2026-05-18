import { tool } from "ai";
import { z } from "zod";

const twitterSchema = z.object({
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  website: z.string().nullable(),
  followerCount: z.number().nullable(),
  followingCount: z.number().nullable(),
  joinDate: z.string().nullable(),
  verified: z.boolean().nullable(),
  recentTweets: z.array(z.object({
    text: z.string().describe("Tweet text or summary"),
    topic: z.string().nullable().describe("Topic: legal-tech, AI, coding, career, crypto, personal, other"),
    engagement: z.string().nullable().describe("Approximate likes/retweets if visible"),
  })).describe("Recent tweets visible on the profile"),
  topicSummary: z.string().nullable().describe("1-2 sentence summary of what this person tweets about"),
});

export const twitterLookupTool = tool({
  description: "Extract a Twitter/X profile and recent tweets using a stealth browser. Returns bio, follower count, recent tweets with topic analysis. Use when a candidate has a Twitter handle.",
  inputSchema: z.object({
    handle: z.string().describe("Twitter handle (with or without @)"),
  }),
  execute: async ({ handle }) => {
    const cleanHandle = handle.replace(/^@/, "");
    const { getBrowserbaseApiKey, getBrowserbaseProjectId } = await import("@/lib/api-keys");
    const bbKey = await getBrowserbaseApiKey();
    const bbProject = await getBrowserbaseProjectId();

    if (!bbKey || !bbProject) {
      return firecrawlFallback(cleanHandle);
    }

    try {
      const { Stagehand } = await import("@browserbasehq/stagehand");

      const stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: bbKey,
        projectId: bbProject,
        model: {
          modelName: "anthropic/claude-sonnet-4-6",
          apiKey: await (await import("../anthropic")).getAnthropicApiKey(),
        },
        verbose: 0,
      });

      try {
        await stagehand.init();

        await stagehand.act(`Navigate to https://x.com/${cleanHandle} and wait for the profile page to fully load.`);

        const profileData = await stagehand.extract(
          "Extract the Twitter/X profile data from this page: handle, display name, bio, location, " +
          "website link, follower count, following count, join date, verified status, " +
          "and the text of recent tweets visible on the page (up to 10). " +
          "For each tweet, categorize the topic (legal-tech, AI, coding, career, crypto, personal, other). " +
          "Also provide a 1-2 sentence summary of what this person generally tweets about.",
          twitterSchema,
        );

        return JSON.stringify(profileData, null, 2);
      } finally {
        await stagehand.close().catch(() => {});
      }
    } catch (e: any) {
      console.error("[twitter-lookup] Browserbase error:", e.message);
      return firecrawlFallback(cleanHandle);
    }
  },
});

async function firecrawlFallback(handle: string): Promise<string> {
  const { getFirecrawlApiKey } = await import("@/lib/api-keys");
  const apiKey = await getFirecrawlApiKey();
  if (!apiKey) return "Error: neither BROWSERBASE nor FIRECRAWL configured";

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query: `"${handle}" site:x.com OR site:twitter.com`, limit: 5 }),
    });

    if (!res.ok) return `Twitter search error: ${res.status}`;

    const json = await res.json();
    const results = json.data || [];
    if (results.length === 0) return "No Twitter profile found.";

    return results
      .map((r: any) => `${r.title || ""}\n${r.url || ""}\n${(r.description || "").slice(0, 300)}`)
      .join("\n\n");
  } catch (e: any) {
    return `Twitter lookup error: ${e.message}`;
  }
}
