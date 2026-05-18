import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { buildWhere, buildOrderBy } from "@/lib/filters";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { MetaStrip } from "@/components/meta-strip";
import { CandidateList } from "@/components/candidate-list";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params.sort);

  const [candidates, allCandidates] = await Promise.all([
    prisma.candidate.findMany({
      where: where as any,
      orderBy: orderBy as any,
      take: 200,
      include: {
        profile: { select: { summary: true, fitScore: true, seniority: true } },
        crm: { select: { status: true } },
        repos: { select: { language: true }, take: 20 },
        forkMeta: { select: { hasOwnCommits: true, aheadBy: true } },
      },
    }),
    prisma.candidate.findMany({
      select: {
        profile: { select: { fitScore: true } },
        crm: { select: { status: true } },
        forkMeta: { select: { hasOwnCommits: true } },
      },
    }),
  ]);

  const total = allCandidates.length;
  const avgFit = total > 0
    ? (allCandidates.reduce((s, c) => s + (c.profile?.fitScore ?? 0), 0) / total).toFixed(2)
    : "0";
  const ownCommitsForks = allCandidates.filter(c => c.forkMeta?.hasOwnCommits).length;
  const byStatus: Record<string, number> = {};
  allCandidates.forEach(c => {
    const st = c.crm?.status ?? "new";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
  });

  const rows = candidates.map(c => ({
    login: c.login,
    name: c.name,
    avatarUrl: c.avatarUrl,
    location: c.location,
    summary: c.profile?.summary ?? null,
    fitScore: c.profile?.fitScore ?? null,
    status: c.crm?.status ?? "new",
    topLanguages: [...new Set(c.repos.map(r => r.language).filter(Boolean))] as string[],
    followers: c.followers,
    publicRepos: c.publicRepos,
    hasOwnCommits: c.forkMeta?.hasOwnCommits ?? false,
    aheadBy: c.forkMeta?.aheadBy ?? 0,
  }));

  return (
    <div className="app-shell">
      <Topbar />
      <div className="list-page view-enter">
        <Suspense><FilterBar /></Suspense>
        <MetaStrip filtered={rows.length} total={total} avgFit={avgFit}
          ownCommitsForks={ownCommitsForks} byStatus={byStatus} />
        <CandidateList candidates={rows} sort={params.sort ?? "fit-desc"} />
      </div>
    </div>
  );
}
