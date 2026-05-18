export function buildWhere(searchParams: Record<string, string | undefined>) {
  const where: Record<string, unknown> = {};
  const { status, seniority, fitMin, fitMax, hasOwnCommits, language, q } = searchParams;

  if (status) where.crm = { status };
  if (seniority) where.profile = { ...((where.profile as object) ?? {}), seniority };
  if (fitMin || fitMax) {
    where.profile = {
      ...((where.profile as object) ?? {}),
      fitScore: {
        ...(fitMin ? { gte: parseInt(fitMin) } : {}),
        ...(fitMax ? { lte: parseInt(fitMax) } : {}),
      },
    };
  }
  if (hasOwnCommits === "true") where.forkMeta = { hasOwnCommits: true };
  if (language) where.repos = { some: { language } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { bio: { contains: q } },
      { login: { contains: q } },
    ];
  }
  return where;
}

export function buildOrderBy(sort?: string) {
  switch (sort) {
    case "followers":
      return { followers: "desc" as const };
    case "publicRepos":
      return { publicRepos: "desc" as const };
    case "fetchedAt":
      return { fetchedAt: "desc" as const };
    case "fitScore":
    default:
      return { profile: { fitScore: "desc" as const } };
  }
}
