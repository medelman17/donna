import { tool } from "ai";
import { z } from "zod";
import { cacheGet, cacheSet } from "@/lib/redis";

export const stackoverflowLookupTool = tool({
  description: "Look up a developer's Stack Overflow profile. Reputation and top tags reveal expertise depth and community standing. Use for INVESTIGATE candidates when you want to verify technical claims.",
  inputSchema: z.object({
    login: z.string().describe("GitHub username (often matches SO username)"),
    name: z.string().optional().describe("Full name for search fallback"),
  }),
  execute: async ({ login, name }) => {
    const cacheKey = `so:${login}`;
    const cached = await cacheGet("so", cacheKey);
    if (cached) return cached;

    try {
      const searchName = name ?? login;
      const res = await fetch(
        `https://api.stackexchange.com/2.3/users?order=desc&sort=reputation&inname=${encodeURIComponent(searchName)}&site=stackoverflow&pagesize=3&filter=!nNPvSNdWme`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!res.ok) return `Stack Overflow API error: ${res.status}`;

      const data = await res.json();
      const users = data.items ?? [];
      if (users.length === 0) return "No Stack Overflow profile found.";

      const best = users.find((u: any) =>
        u.display_name?.toLowerCase() === searchName.toLowerCase() ||
        u.link?.toLowerCase().includes(login.toLowerCase())
      ) ?? users[0];

      const sections: string[] = [];
      sections.push(`## Stack Overflow: ${best.display_name}`);
      sections.push(`- **Reputation**: ${best.reputation?.toLocaleString() ?? "?"}`);
      sections.push(`- **Badges**: ${best.badge_counts?.gold ?? 0} gold, ${best.badge_counts?.silver ?? 0} silver, ${best.badge_counts?.bronze ?? 0} bronze`);
      sections.push(`- **Profile**: ${best.link ?? "?"}`);

      if (best.user_id) {
        const tagsRes = await fetch(
          `https://api.stackexchange.com/2.3/users/${best.user_id}/top-tags?site=stackoverflow&pagesize=10`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          const tags = (tagsData.items ?? []).slice(0, 8);
          if (tags.length > 0) {
            sections.push(`- **Top Tags**: ${tags.map((t: any) => `${t.tag_name} (${t.answer_count} answers)`).join(", ")}`);
          }
        }
      }

      const result = sections.join("\n");
      await cacheSet("so", cacheKey, result, 86400);
      return result;
    } catch (e: any) {
      return `Stack Overflow lookup error: ${e.message}`;
    }
  },
});
