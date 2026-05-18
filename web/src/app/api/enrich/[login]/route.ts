import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichQueue, ensureWorker, getActiveJob, setActiveJob } from "@/lib/queue";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { login } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const existing = await getActiveJob(login);
  if (existing) {
    return NextResponse.json({ jobId: existing, status: "already_running" });
  }

  await ensureWorker();

  const job = await enrichQueue.add("enrich", { login }, {
    jobId: `enrich-${login}-${Date.now()}`,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 3600 },
  });

  await setActiveJob(login, job.id!);

  return NextResponse.json({ jobId: job.id, status: "queued" });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const [logCount, repoCount, profileCount, linkedInCount, webCount, activeJobId] = await Promise.all([
    prisma.enrichmentLog.count({ where: { candidateLogin: login } }),
    prisma.repo.count({ where: { candidateLogin: login } }),
    prisma.profile.count({ where: { candidateLogin: login } }),
    prisma.linkedInProfile.count({ where: { candidateLogin: login } }),
    prisma.webMention.count({ where: { candidateLogin: login } }),
    getActiveJob(login),
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
    enriching: !!activeJobId,
    jobId: activeJobId,
  });
}
