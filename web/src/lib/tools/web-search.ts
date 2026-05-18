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
