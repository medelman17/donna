import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet } from "@/lib/redis";

const execFileAsync = promisify(execFile);

export const ghQueryTool = tool({
  description: "Query the GitHub REST API. Use for profiles, repos, events, READMEs, commits.",
  parameters: z.object({
    endpoint: z.string().describe("GitHub API path, e.g. /users/octocat"),
    jq_filter: z.string().optional().describe("Optional jq filter to apply"),
  }),
  execute: async ({ endpoint, jq_filter }, { abortSignal }) => {
    const cached = await cacheGet("gh", endpoint);
    if (cached) return cached;

    const args = ["api", endpoint, "--header", "Accept: application/vnd.github+json"];
    if (jq_filter) args.push("--jq", jq_filter);

    try {
      const { stdout, stderr } = await execFileAsync("gh", args, {
        timeout: 30000,
        signal: abortSignal,
      });

      if (stdout.trim()) {
        await cacheSet("gh", endpoint, stdout.trim(), 3600);

        // Side-effect: persist GitHub data
        try {
          const data = JSON.parse(stdout);
          await persistGhData(endpoint, data);
        } catch {}
      }

      return stdout.trim() || "(empty response)";
    } catch (e: any) {
      return `Error: ${e.message?.slice(0, 200)}`;
    }
  },
});

async function persistGhData(endpoint: string, data: any) {
  const loginMatch = endpoint.match(/\/users\/([^/]+)$/);
  if (loginMatch && typeof data === "object" && data.login) {
    await prisma.candidate.upsert({
      where: { login: data.login },
      create: {
        login: data.login,
        name: data.name,
        bio: data.bio,
        location: data.location,
        company: data.company,
        blog: data.blog,
        twitter: data.twitter_username,
        followers: data.followers ?? 0,
        publicRepos: data.public_repos ?? 0,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
        githubCreatedAt: data.created_at ? new Date(data.created_at) : null,
      },
      update: {
        name: data.name,
        bio: data.bio,
        location: data.location,
        company: data.company,
        blog: data.blog,
        twitter: data.twitter_username,
        followers: data.followers ?? 0,
        publicRepos: data.public_repos ?? 0,
        avatarUrl: data.avatar_url,
        htmlUrl: data.html_url,
      },
    });
  }
}
