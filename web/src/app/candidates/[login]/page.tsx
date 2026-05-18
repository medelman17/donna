import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalList } from "@/components/signal-list";
import { RepoCard } from "@/components/repo-card";
import { CrmPanel } from "@/components/crm-panel";

type Props = { params: Promise<{ login: string }> };

export default async function CandidatePage({ params }: Props) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { login },
    include: {
      profile: true, forkMeta: true, signals: true, skills: true,
      repos: { orderBy: { stars: "desc" }, take: 10 },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      crm: true, linkedIn: true,
      webMentions: { orderBy: { scrapedAt: "desc" }, take: 10 },
    },
  });

  if (!candidate) notFound();
  const { profile, signals, skills, repos, events, crm, linkedIn, webMentions } = candidate;

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex items-start gap-4">
        {candidate.avatarUrl && <img src={candidate.avatarUrl} alt={login} className="h-16 w-16 rounded-full" />}
        <div>
          <h1 className="text-2xl font-bold">{candidate.name || login}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {candidate.location && <span>{candidate.location}</span>}
            {candidate.company && <span>{candidate.company}</span>}
            <a href={candidate.htmlUrl ?? `https://github.com/${login}`} target="_blank" rel="noopener noreferrer" className="hover:underline">GitHub</a>
            {linkedIn?.profileUrl && <a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">LinkedIn</a>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Assessment
                  {profile.fitScore != null && <Badge>{profile.fitScore}/5</Badge>}
                  {profile.seniority && <Badge variant="secondary">{profile.seniority}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.summary && <p>{profile.summary}</p>}
                {profile.fitReasoning && <p className="text-sm text-muted-foreground">{profile.fitReasoning}</p>}
              </CardContent>
            </Card>
          )}

          {signals.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
              <CardContent><SignalList signals={signals.map((s) => ({ kind: s.kind, text: s.text }))} /></CardContent>
            </Card>
          )}

          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => <Badge key={s.id} variant="secondary">{s.name}</Badge>)}
            </div>
          )}

          {linkedIn?.headline && (
            <Card>
              <CardHeader><CardTitle>LinkedIn</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-medium">{linkedIn.headline}</p>
                {linkedIn.currentTitle && <p>{linkedIn.currentTitle} at {linkedIn.currentCompany}</p>}
              </CardContent>
            </Card>
          )}

          {webMentions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Web Presence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {webMentions.map((m) => (
                  <div key={m.id}>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      [{m.source}] {m.title || m.url}
                    </a>
                    {m.snippet && <p className="text-muted-foreground">{m.snippet}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {repos.length > 0 && (
            <div>
              <h3 className="mb-3 font-semibold">Top Repos</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {repos.map((r) => (
                  <RepoCard key={r.id} name={r.name} htmlUrl={r.htmlUrl} description={r.description}
                    language={r.language} stars={r.stars} forks={r.forks} isFork={r.isFork} />
                ))}
              </div>
            </div>
          )}

          {events.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {events.slice(0, 15).map((e) => (
                    <div key={e.id} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</span>
                      <Badge variant="outline" className="text-xs">{e.type}</Badge>
                      {e.repoName && <span className="truncate">{e.repoName}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <CrmPanel login={login} status={crm?.status ?? "new"} notes={crm?.notes ?? null} tags={crm?.tags ?? null} />
        </div>
      </div>
    </div>
  );
}
