import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { cacheGet, cacheSet } from "@/lib/redis";

const execFileAsync = promisify(execFile);

export const githubContributionsTool = tool({
  description: "Analyze a developer's contributions to OTHER people's repos — PRs merged, issues filed, code reviews. Shows collaboration skills and open source involvement. Use for INVESTIGATE candidates.",
  inputSchema: z.object({
    login: z.string().describe("GitHub username"),
  }),
  execute: async ({ login }, { abortSignal }) => {
    const cacheKey = `contributions:${login}`;
    const cached = await cacheGet("gh", cacheKey);
    if (cached) return cached;

    const sections: string[] = [];

    try {
      const [prs, issues, starred] = await Promise.all([
        ghApi(`search/issues?q=author:${login}+type:pr+is:merged+-user:${login}&sort=updated&per_page=10`, abortSignal),
        ghApi(`search/issues?q=author:${login}+type:issue+-user:${login}&sort=updated&per_page=10`, abortSignal),
        ghApi(`users/${login}/starred?per_page=10&sort=updated`, abortSignal),
      ]);

      if (prs) {
        const data = JSON.parse(prs);
        const count = data.total_count ?? 0;
        const items = (data.items ?? []).slice(0, 5);
        sections.push(`## PRs Merged to Other Repos: ${count} total`);
        if (items.length > 0) {
          sections.push(items.map((pr: any) =>
            `- ${pr.repository_url?.split("/").slice(-2).join("/") ?? "?"}: "${pr.title}" (${pr.closed_at?.slice(0, 10) ?? "?"})`
          ).join("\n"));
        }
      }

      if (issues) {
        const data = JSON.parse(issues);
        const count = data.total_count ?? 0;
        const items = (data.items ?? []).slice(0, 5);
        sections.push(`## Issues Filed on Other Repos: ${count} total`);
        if (items.length > 0) {
          sections.push(items.map((issue: any) =>
            `- ${issue.repository_url?.split("/").slice(-2).join("/") ?? "?"}: "${issue.title}"`
          ).join("\n"));
        }
      }

      if (starred) {
        const repos = JSON.parse(starred);
        if (Array.isArray(repos) && repos.length > 0) {
          sections.push(`## Recently Starred Repos (interests)`);
          sections.push(repos.slice(0, 8).map((r: any) =>
            `- ${r.full_name}: ${r.description?.slice(0, 80) ?? "no description"} (★${r.stargazers_count})`
          ).join("\n"));
        }
      }
    } catch (e: any) {
      sections.push(`Error fetching contributions: ${e.message}`);
    }

    const result = sections.join("\n\n") || "No external contributions found.";
    await cacheSet("gh", cacheKey, result, 3600);
    return result;
  },
});

async function ghApi(endpoint: string, abortSignal?: AbortSignal): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("gh", ["api", endpoint, "--header", "Accept: application/vnd.github+json"], {
      timeout: 15000,
      signal: abortSignal,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
