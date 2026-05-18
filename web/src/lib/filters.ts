export function buildWhere(params: Record<string, string | undefined>) {
  const where: Record<string, unknown> = {};
  const { status, seniority, minFit, hasCommits, language, q } = params;

  if (status && status !== "all") where.crm = { status };
  if (seniority && seniority !== "all") where.profile = { ...((where.profile as object) ?? {}), seniority };
  if (minFit && parseInt(minFit) > 0) {
    where.profile = {
      ...((where.profile as object) ?? {}),
      fitScore: { gte: parseInt(minFit) },
    };
  }
  if (hasCommits === "true") where.forkMeta = { hasOwnCommits: true };
  if (params.bookmarked === "true") where.crm = { ...((where.crm as object) ?? {}), bookmarked: true };
  if (language && language !== "all") where.repos = { some: { language } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { bio: { contains: q } },
      { login: { contains: q } },
      { location: { contains: q } },
    ];
  }
  return where;
}

export function buildOrderBy(sort?: string) {
  switch (sort) {
    case "fit-asc":
      return { profile: { fitScore: "asc" as const } };
    case "followers-desc":
      return { followers: "desc" as const };
    case "repos-desc":
      return { publicRepos: "desc" as const };
    case "fetched-desc":
      return { fetchedAt: "desc" as const };
    case "name-asc":
      return { name: "asc" as const };
    case "fit-desc":
    default:
      return { profile: { fitScore: "desc" as const } };
  }
}
