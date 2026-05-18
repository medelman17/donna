import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { buildWhere, buildOrderBy } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";
import { CandidateRow } from "@/components/candidate-row";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params.sort);

  const candidates = await prisma.candidate.findMany({
    where: where as any,
    orderBy: orderBy as any,
    take: 100,
    include: {
      profile: { select: { summary: true, fitScore: true } },
      crm: { select: { status: true } },
      repos: { select: { language: true }, take: 20 },
    },
  });

  return (
    <div>
      <Suspense><FilterBar /></Suspense>
      <div className="space-y-2">
        {candidates.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No candidates found. Run the pipeline first.</p>
        )}
        {candidates.map((c) => {
          const langs = [...new Set(c.repos.map((r) => r.language).filter(Boolean))] as string[];
          return (
            <CandidateRow key={c.login} login={c.login} name={c.name} avatarUrl={c.avatarUrl}
              location={c.location} summary={c.profile?.summary ?? null}
              fitScore={c.profile?.fitScore ?? null} status={c.crm?.status ?? "new"} topLanguages={langs} />
          );
        })}
      </div>
    </div>
  );
}
