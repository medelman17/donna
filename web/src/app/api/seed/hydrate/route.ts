import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";

const execFileAsync = promisify(execFile);

const BATCH_SIZE = 50;

const USER_FIELDS = `
  name bio location company
  followers { totalCount }
  repositories(privacy: PUBLIC) { totalCount }
  contributionsCollection { totalCommitContributions }
  createdAt isHireable twitterUsername websiteUrl
`;

export async function POST() {
  const unhydrated = await prisma.candidate.findMany({
    where: {
      OR: [
        { name: null, followers: 0, publicRepos: 0 },
        { totalCommits: 0 },
      ],
    },
    select: { login: true },
  });

  if (unhydrated.length === 0) {
    return NextResponse.json({ hydrated: 0, total: await prisma.candidate.count() });
  }

  let hydrated = 0;

  for (let i = 0; i < unhydrated.length; i += BATCH_SIZE) {
    const batch = unhydrated.slice(i, i + BATCH_SIZE);

    const aliases = batch
      .map((c, j) => `u${j}: user(login: "${c.login}") { login ${USER_FIELDS} }`)
      .join("\n");

    try {
      const { stdout } = await execFileAsync(
        "gh",
        ["api", "graphql", "-f", `query={ ${aliases} }`, "--jq", ".data"],
        { timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
      );

      const data = JSON.parse(stdout);

      for (const key of Object.keys(data)) {
        const u = data[key];
        if (!u?.login) continue;

        await prisma.candidate.update({
          where: { login: u.login },
          data: {
            name: u.name ?? undefined,
            bio: u.bio ?? undefined,
            location: u.location ?? undefined,
            company: u.company ?? undefined,
            followers: u.followers?.totalCount ?? 0,
            publicRepos: u.repositories?.totalCount ?? 0,
            totalCommits: u.contributionsCollection?.totalCommitContributions ?? 0,
            hireable: u.isHireable ?? undefined,
            twitter: u.twitterUsername ?? undefined,
            blog: u.websiteUrl ?? undefined,
            githubCreatedAt: u.createdAt ? new Date(u.createdAt) : undefined,
          },
        });

        hydrated++;
      }
    } catch (e: any) {
      console.error(`[hydrate] Batch ${i}-${i + BATCH_SIZE} failed:`, e.message);
    }
  }

  const total = await prisma.candidate.count();
  return NextResponse.json({ hydrated, total });
}
