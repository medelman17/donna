import { tool } from "ai";
import { z } from "zod";
import { cacheGet, cacheSet } from "@/lib/redis";

export const devtoPostsTool = tool({
  description: "Search dev.to and Hashnode for a developer's technical blog posts. Published articles show communication skills, expertise depth, and community engagement. Use for INVESTIGATE candidates.",
  inputSchema: z.object({
    username: z.string().describe("Username to search (try GitHub login first)"),
    name: z.string().optional().describe("Full name for broader search"),
  }),
  execute: async ({ username, name }) => {
    const sections: string[] = [];

    const devto = await searchDevTo(username);
    if (devto) sections.push(devto);

    if (name) {
      const devtoByName = await searchDevToByName(name);
      if (devtoByName && !devto) sections.push(devtoByName);
    }

    const hashnode = await searchHashnode(username);
    if (hashnode) sections.push(hashnode);

    return sections.join("\n\n") || "No technical blog posts found on dev.to or Hashnode.";
  },
});

async function searchDevTo(username: string): Promise<string | null> {
  const cacheKey = `devto:${username}`;
  const cached = await cacheGet("devto", cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://dev.to/api/articles?username=${encodeURIComponent(username)}&per_page=10`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const articles = await res.json();
    if (!Array.isArray(articles) || articles.length === 0) return null;

    const lines = articles.map((a: any) => {
      const reactions = a.positive_reactions_count ?? 0;
      const comments = a.comments_count ?? 0;
      const tags = (a.tag_list ?? []).join(", ");
      return `- **${a.title}** (${a.published_at?.slice(0, 10) ?? "?"}) — ${reactions} reactions, ${comments} comments${tags ? ` [${tags}]` : ""}`;
    });

    const result = `## dev.to Posts by ${username}: ${articles.length} articles\n${lines.join("\n")}`;
    await cacheSet("devto", cacheKey, result, 86400);
    return result;
  } catch {
    return null;
  }
}

async function searchDevToByName(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://dev.to/api/articles?tag=&top=365&per_page=5&search=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const articles = await res.json();
    if (!Array.isArray(articles) || articles.length === 0) return null;

    const relevant = articles.filter((a: any) =>
      a.user?.name?.toLowerCase().includes(name.toLowerCase()) ||
      a.user?.username?.toLowerCase().includes(name.toLowerCase().replace(/\s/g, ""))
    );
    if (relevant.length === 0) return null;

    const lines = relevant.map((a: any) =>
      `- **${a.title}** by ${a.user?.name ?? "?"} (${a.published_at?.slice(0, 10) ?? "?"})`
    );

    return `## dev.to Posts matching "${name}"\n${lines.join("\n")}`;
  } catch {
    return null;
  }
}

async function searchHashnode(username: string): Promise<string | null> {
  const cacheKey = `hashnode:${username}`;
  const cached = await cacheGet("hashnode", cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch("https://gql.hashnode.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query { user(username: "${username}") { name publications(first: 1) { edges { node { posts(first: 10) { edges { node { title brief slug publishedAt reactionCount responseCount tags { name } } } } } } } } }`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const posts = data.data?.user?.publications?.edges?.[0]?.node?.posts?.edges;
    if (!posts || posts.length === 0) return null;

    const lines = posts.map((e: any) => {
      const p = e.node;
      const tags = (p.tags ?? []).map((t: any) => t.name).join(", ");
      return `- **${p.title}** (${p.publishedAt?.slice(0, 10) ?? "?"}) — ${p.reactionCount ?? 0} reactions${tags ? ` [${tags}]` : ""}`;
    });

    const authorName = data.data?.user?.name ?? username;
    const result = `## Hashnode Posts by ${authorName}: ${posts.length} articles\n${lines.join("\n")}`;
    await cacheSet("hashnode", cacheKey, result, 86400);
    return result;
  } catch {
    return null;
  }
}
