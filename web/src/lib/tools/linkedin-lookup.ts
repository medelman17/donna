import { tool } from "ai";
import { z } from "zod";

export const linkedinLookupTool = tool({
  description: "Search for a person's LinkedIn profile. Returns profile URL and any available info from search results.",
  inputSchema: z.object({
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
