import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const REPO = "willchen96/mike";

export async function POST() {
  const seen = new Set<string>();
  let ingested = 0;

  const existing = await prisma.candidate.findMany({ select: { login: true } });
  for (const c of existing) seen.add(c.login);

  const endpoints = [
    { path: `repos/${REPO}/forks?sort=newest&per_page=100`, type: "fork" },
    { path: `repos/${REPO}/issues?state=all&per_page=100`, type: "issue" },
    { path: `repos/${REPO}/pulls?state=all&per_page=100`, type: "pr" },
    { path: `repos/${REPO}/contributors?per_page=100`, type: "contributor" },
    { path: `repos/${REPO}/stargazers?per_page=100`, type: "stargazer" },
  ];

  for (const ep of endpoints) {
    try {
      const { stdout } = await execFileAsync("gh", [
        "api", ep.path, "--paginate",
        "--header", "Accept: application/vnd.github+json",
      ], { timeout: 120000, maxBuffer: 20 * 1024 * 1024 });

      const items: any[] = [];
      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) items.push(...parsed);
        else items.push(parsed);
      }

      for (const item of items) {
        if (ep.type === "issue" && item.pull_request) continue;
        const user = ep.type === "fork" ? item.owner : (item.user ?? item);
        const login = user?.login;
        if (!login || seen.has(login)) continue;
        seen.add(login);

        await prisma.candidate.upsert({
          where: { login },
          create: {
            login,
            avatarUrl: user.avatar_url ?? null,
            htmlUrl: user.html_url ?? null,
          },
          update: {},
        });

        if (ep.type === "fork") {
          await prisma.forkMeta.upsert({
            where: { candidateLogin: login },
            create: {
              candidateLogin: login,
              forkHtmlUrl: item.html_url,
              forkPushedAt: item.pushed_at ? new Date(item.pushed_at) : null,
              forkStars: item.stargazers_count ?? 0,
            },
            update: {},
          }).catch(() => {});
        }

        ingested++;
      }
    } catch (e: any) {
      console.error(`[seed] Failed to fetch ${ep.type}:`, e.message);
    }
  }

  const total = await prisma.candidate.count();
  return NextResponse.json({ ingested, total });
}
