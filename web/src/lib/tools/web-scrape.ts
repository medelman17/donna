import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";
import { getFirecrawlApiKey } from "@/lib/api-keys";

export const webScrapeTool = tool({
  description: "Extract content from a URL as clean markdown. Good for blogs, personal sites, articles. Do NOT use on linkedin.com — use linkedin_lookup instead.",
  inputSchema: z.object({
    url: z.string().describe("URL to scrape"),
  }),
  execute: async ({ url }, { toolCallId }) => {
    const cached = await cacheGet("scrape", url);
    if (cached) return cached;

    const apiKey = await getFirecrawlApiKey();
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
