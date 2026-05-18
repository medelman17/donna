import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/atoms";
import { AssessmentCard } from "@/components/assessment-card";
import { SignalList } from "@/components/signal-list";
import { LinkedInBlock } from "@/components/linkedin-block";
import { RepoCard } from "@/components/repo-card";
import { WebMention } from "@/components/web-mention";
import { ActivityList } from "@/components/activity-list";
import { CrmPanel } from "@/components/crm-panel";
import { EnrichButton } from "@/components/enrich-button";
import { DetailNav } from "@/components/detail-nav";
import { MapPin, Building2, ExternalLink, Globe, AtSign, Link2 } from "lucide-react";

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

  return (
    <div className="app-shell">
      <Topbar candidateLogin={login} />
      <DetailNav login={login}>
        <div className="detail-grid view-enter">
          <main className="detail-main">
            <div className="dx">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <a href="/" className="tb-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>&larr; All candidates</a>
              </div>

              <header className="detail-header">
                <Avatar name={candidate.name} login={login} avatarUrl={candidate.avatarUrl} size={62} />
                <div className="h-meta">
                  <div className="h-name">
                    <h1>{candidate.name || login}</h1>
                    <span className="login">@{login}</span>
                    <StatusPill status={crm?.status ?? "new"} />
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
                    {candidate.twitter && <><span className="dotsep">·</span><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><AtSign size={14} /> {candidate.twitter}</span></>}
                    {linkedIn?.profileUrl && <><span className="dotsep">·</span><a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer"><Link2 size={14} /> LinkedIn</a></>}
                  </div>
                </div>
              </header>

              {profile && (
                <AssessmentCard fitScore={profile.fitScore ?? 0} seniority={profile.seniority}
                  confidence={profile.confidence} model={profile.model}
                  generatedAt={profile.generatedAt} summary={profile.summary}
                  fitReasoning={profile.fitReasoning}
                  recommendedOutreach={profile.recommendedOutreach}
                  outreachReason={profile.outreachReason} />
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
                    <h2>LinkedIn</h2>
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
            </div>
          </main>

          <aside className="detail-aside">
            <div style={{ padding: "12px 20px 0", borderBottom: "1px solid var(--color-border)", paddingBottom: 12 }}>
              <h3 style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-fg-subtle)", margin: "0 0 8px" }}>Agent</h3>
              <EnrichButton login={login} />
            </div>
            <CrmPanel login={login}
              status={crm?.status ?? "new"} notes={crm?.notes ?? null} tags={crm?.tags ?? null}
              fitScore={profile?.fitScore ?? null}
              recommendedOutreach={profile?.recommendedOutreach ?? null}
              confidence={profile?.confidence ?? null}
              model={profile?.model ?? null}
              followers={candidate.followers} publicRepos={candidate.publicRepos}
              githubCreatedAt={candidate.githubCreatedAt}
              hasOwnCommits={forkMeta?.hasOwnCommits ?? false}
              aheadBy={forkMeta?.aheadBy ?? 0} behindBy={forkMeta?.behindBy ?? 0}
              forkPushedAt={forkMeta?.forkPushedAt ?? null} />
          </aside>
        </div>
      </DetailNav>
    </div>
  );
}
