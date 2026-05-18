import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { prisma } from "@/lib/prisma";
import path from "path";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { login } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const pipelineDir = path.resolve(process.cwd(), "..", "pipeline");

  exec(
    `uv run scout deep-dive ${login}`,
    { cwd: pipelineDir, env: { ...process.env } },
    (error, stdout, stderr) => {
      if (error) console.error(`Enrich error for ${login}:`, stderr);
      else console.log(`Enrich done for ${login}`);
    }
  );

  return NextResponse.json({ status: "started", login });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const [logCount, repoCount, profileCount, linkedInCount, webCount] = await Promise.all([
    prisma.enrichmentLog.count({ where: { candidateLogin: login } }),
    prisma.repo.count({ where: { candidateLogin: login } }),
    prisma.profile.count({ where: { candidateLogin: login } }),
    prisma.linkedInProfile.count({ where: { candidateLogin: login } }),
    prisma.webMention.count({ where: { candidateLogin: login } }),
  ]);

  const recentLogs = await prisma.enrichmentLog.findMany({
    where: { candidateLogin: login },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { tool: true, error: true, durationMs: true, createdAt: true },
  });

  return NextResponse.json({
    login,
    enriched: repoCount > 0,
    analyzed: profileCount > 0,
    hasLinkedIn: linkedInCount > 0,
    webMentions: webCount,
    toolCalls: logCount,
    recentLogs,
  });
}
