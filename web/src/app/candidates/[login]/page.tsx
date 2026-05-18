import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Avatar } from "@/components/avatar";
import { StatusPill, FitChip } from "@/components/atoms";
import { AssessmentCard } from "@/components/assessment-card";
import { SignalList } from "@/components/signal-list";
import { LinkedInBlock } from "@/components/linkedin-block";
import { RepoCard } from "@/components/repo-card";
import { WebMention } from "@/components/web-mention";
import { ActivityList } from "@/components/activity-list";
import { CrmPanel } from "@/components/crm-panel";
import { DetailWithEnrich } from "@/components/detail-with-enrich";
import { DetailNav } from "@/components/detail-nav";
import { EnrichmentHistory } from "@/components/enrichment-history";
import { EnrichButton } from "@/components/enrich-button";
import { MobileSheet } from "@/components/mobile-sheet";
import { MapPin, Building2, ExternalLink, Globe, AtSign, Link2, Mail } from "lucide-react";

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
  const { profile, forkMeta, signals, skills, repos, events, crm, linkedIn, webMentions } = candidate;

  const enrichmentLogs = await prisma.enrichmentLog.findMany({
    where: { candidateLogin: login },
    orderBy: { createdAt: "desc" },
    select: { tool: true, createdAt: true, output: true },
  });

  const enrichmentRuns = (() => {
    const runs: { startedAt: string; tools: { tool: string; createdAt: string }[]; narrative: string | null }[] = [];
    let current: typeof runs[0] | null = null;
    const sorted = [...enrichmentLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const log of sorted) {
      if (log.tool === "__narrative__") {
        if (current) current.narrative = (log.output as any)?.text ?? null;
        continue;
      }
      if (!current || log.createdAt.getTime() - new Date(current.tools[current.tools.length - 1]?.createdAt ?? 0).getTime() > 60_000) {
        current = { startedAt: log.createdAt.toISOString(), tools: [], narrative: null };
        runs.push(current);
      }
      current.tools.push({ tool: log.tool, createdAt: log.createdAt.toISOString() });
    }
    return runs.reverse();
  })();

  return (
    <div className="app-shell">
      <Topbar candidateLogin={login} />
      <DetailNav login={login}>
        <div className="detail-grid view-enter">
          <DetailWithEnrich login={login}>
              <header className="detail-header">
                <Avatar name={candidate.name} login={login} avatarUrl={candidate.avatarUrl} size={62} />
                <div className="h-meta">
                  <div className="h-name">
                    <h1>{candidate.name || login}</h1>
                    <span className="login">@{login}</span>
                    <StatusPill status={crm?.status ?? "new"} />
                    <EnrichButton />
                  </div>
                  {candidate.bio && <p className="h-bio">{candidate.bio}</p>}
                  <div className="h-row">
                    {candidate.location && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><MapPin size={14} /> {candidate.location}</span>}
                    {candidate.company && <><span className="dotsep">·</span><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Building2 size={14} /> {candidate.company}</span></>}
                    <span className="dotsep">·</span>
                    <a href={candidate.htmlUrl ?? `https://github.com/${login}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> github.com/{login}
                    </a>
                    {candidate.blog && <><span className="dotsep">·</span><a href={candidate.blog} target="_blank" rel="noopener noreferrer"><Globe size={14} /> {candidate.blog.replace("https://", "")}</a></>}
                    {candidate.email && <><span className="dotsep">·</span><a href={`mailto:${candidate.email}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Mail size={14} /> {candidate.email}</a></>}
                    {candidate.twitter && <><span className="dotsep">·</span><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><AtSign size={14} /> {candidate.twitter}</span></>}
                    {linkedIn?.profileUrl && <><span className="dotsep">·</span><a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer"><Link2 size={14} /> LinkedIn</a></>}
                  </div>
                </div>
              </header>

              {profile?.summary && (
                <div className="candidate-summary">
                  <div className="cs-fit"><FitChip score={profile.fitScore ?? 0} /></div>
                  <p>{profile.summary}</p>
                </div>
              )}

              {profile && (
                <AssessmentCard fitScore={profile.fitScore ?? 0} seniority={profile.seniority}
                  confidence={profile.confidence} model={profile.model}
                  generatedAt={profile.generatedAt} summary={null}
                  fitReasoning={profile.fitReasoning}
                  recommendedOutreach={profile.recommendedOutreach}
                  outreachReason={profile.outreachReason}
                  openToWork={profile.openToWork} isLawyer={profile.isLawyer}
                  hasOwnCompany={profile.hasOwnCompany} companyName={profile.companyName}
                  aiExperience={profile.aiExperience} legalTechRelevance={profile.legalTechRelevance}
                  communityActivity={profile.communityActivity} influenceLevel={profile.influenceLevel} />
              )}

              <section className="section">
                <div className="section-h">
                  <h2>Signals</h2>
                  <span className="count">
                    {signals.filter(s => s.kind === "positive").length} positive ·{" "}
                    {signals.filter(s => s.kind === "negative").length} negative ·{" "}
                    {signals.filter(s => s.kind === "notable").length} notable
                  </span>
                </div>
                <SignalList signals={signals.map(s => ({ kind: s.kind, text: s.text }))} />
              </section>

              {skills.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Skills</h2><span className="count">{skills.length}</span></div>
                  <div className="tags-cloud">{skills.map(s => <span key={s.id} className="tag">{s.name}</span>)}</div>
                </section>
              )}

              {linkedIn?.headline && (
                <section className="section">
                  <div className="section-h">
                    <h2>{linkedIn.profileUrl ? <a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>LinkedIn ↗</a> : "LinkedIn"}</h2>
                    {linkedIn.connectionCount != null && <span className="count">{linkedIn.connectionCount} connections</span>}
                  </div>
                  <LinkedInBlock li={linkedIn} />
                </section>
              )}

              {webMentions.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Web Presence</h2><span className="count">{webMentions.length}</span></div>
                  <div className="web-list">
                    {webMentions.map(w => <WebMention key={w.id} url={w.url} title={w.title} snippet={w.snippet} source={w.source} />)}
                  </div>
                </section>
              )}

              {repos.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Top Repos</h2><span className="count">{repos.length}</span></div>
                  <div className="repo-list">
                    {repos.map(r => <RepoCard key={r.id} name={r.name} htmlUrl={r.htmlUrl} description={r.description}
                      language={r.language} stars={r.stars} forks={r.forks} isFork={r.isFork} pushedAt={r.pushedAt} />)}
                  </div>
                </section>
              )}

              {events.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Recent Activity</h2><span className="count">{events.length} events</span></div>
                  <ActivityList events={events} />
                </section>
              )}

              <section className="section">
                <div className="section-h">
                  <h2>Enrichment Runs</h2>
                  <span className="count">{enrichmentRuns.length} runs</span>
                </div>
                <EnrichmentHistory runs={enrichmentRuns} />
              </section>
          </DetailWithEnrich>

          <MobileSheet>
            <CrmPanel login={login}
              status={crm?.status ?? "new"} bookmarked={crm?.bookmarked ?? false} notes={crm?.notes ?? null} tags={crm?.tags ?? null}
              fitScore={profile?.fitScore ?? null}
              recommendedOutreach={profile?.recommendedOutreach ?? null}
              confidence={profile?.confidence ?? null}
              model={profile?.model ?? null}
              email={candidate.email ?? null} name={candidate.name ?? null}
              bio={candidate.bio ?? null} blog={candidate.blog ?? null}
              company={candidate.company ?? null} twitter={candidate.twitter ?? null}
              htmlUrl={candidate.htmlUrl ?? null} linkedInUrl={linkedIn?.profileUrl ?? null}
              followers={candidate.followers} publicRepos={candidate.publicRepos}
              githubCreatedAt={candidate.githubCreatedAt}
              hasOwnCommits={forkMeta?.hasOwnCommits ?? false}
              aheadBy={forkMeta?.aheadBy ?? 0} behindBy={forkMeta?.behindBy ?? 0}
              forkPushedAt={forkMeta?.forkPushedAt ?? null}
              openToWork={profile?.openToWork ?? null}
              aiExperience={profile?.aiExperience ?? null}
              legalTechRelevance={profile?.legalTechRelevance ?? null}
              seniority={profile?.seniority ?? null} />
          </MobileSheet>
        </div>
      </DetailNav>
    </div>
  );
}
