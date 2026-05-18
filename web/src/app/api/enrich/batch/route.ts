import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichQueue, ensureWorker, getActiveJob, setActiveJob } from "@/lib/queue";

export async function POST(request: NextRequest) {
  const { logins } = await request.json() as { logins: string[] };

  if (!Array.isArray(logins) || logins.length === 0) {
    return NextResponse.json({ error: "logins array required" }, { status: 400 });
  }

  const candidates = await prisma.candidate.findMany({
    where: { login: { in: logins } },
    select: { login: true },
  });
  const validLogins = candidates.map(c => c.login);

  await ensureWorker();

  const results: { login: string; jobId: string; status: string }[] = [];

  for (const login of validLogins) {
    const existing = await getActiveJob(login);
    if (existing) {
      results.push({ login, jobId: existing, status: "already_running" });
      continue;
    }

    const job = await enrichQueue.add("enrich", { login }, {
      jobId: `enrich-${login}-${Date.now()}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 3600 },
    });

    await setActiveJob(login, job.id!);
    results.push({ login, jobId: job.id!, status: "queued" });
  }

  return NextResponse.json({ queued: results.length, jobs: results });
}
