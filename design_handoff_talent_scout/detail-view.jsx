// detail-view.jsx — Candidate detail page (left main, right CRM panel).
/* global React, Avatar, StatusPill, FitScore, LangBadge, fmtNum */

const { useState, useEffect, useRef } = React;

function relTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + "mo ago";
  return Math.floor(mo / 12) + "y ago";
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function Signal({ s }) {
  const ico = s.kind === "positive" ? "+" : s.kind === "negative" ? "−" : "·";
  return (
    <div className="signal" data-kind={s.kind}>
      <span className="ico">{ico}</span>
      <span className="text">{s.text}</span>
    </div>
  );
}

function Repo({ r }) {
  return (
    <div className="repo">
      <div>
        <a className="r-name" href="#" onClick={e => e.preventDefault()}>
          {r.name}
          {r.isFork && <span className="r-fork-flag">fork</span>}
        </a>
        <div className="r-descr">{r.description || <span className="dim">No description</span>}</div>
      </div>
      <div className="r-meta" style={{ alignSelf: "flex-start" }}>
        {r.language && <LangBadge name={r.language} />}
        <span className="item">★ {fmtNum(r.stars)}</span>
        <span className="item">⑂ {r.forks}</span>
        <span className="item dim">{relTime(r.pushedAt)}</span>
      </div>
    </div>
  );
}

function WebMention({ w }) {
  return (
    <div className="web">
      <div className="src" data-s={w.source}>{w.source.replace("_", " ")}</div>
      <div className="body">
        <a className="t" href="#" onClick={e => e.preventDefault()}>{w.title}</a>
        <div className="sn">{w.snippet}</div>
      </div>
    </div>
  );
}

function ActivityRow({ e }) {
  return (
    <div className="act">
      <span className="when">{relTime(e.createdAt)}</span>
      <span className="ev">{e.type.replace("Event", "")}</span>
      <span className="repo-n">{e.repoName}</span>
    </div>
  );
}

// ─── CRM aside ─────────────────────────────────────────────────────────────
function CrmPanel({ candidate, onUpdate }) {
  const [status, setStatus] = useState(candidate.crm.status);
  const [notes, setNotes] = useState(candidate.crm.notes);
  const [tagInput, setTagInput] = useState((candidate.crm.tags || []).join(", "));
  const [saving, setSaving] = useState(null); // null | "saving" | "saved"
  const debRef = useRef(null);

  // Reset state when candidate changes
  useEffect(() => {
    setStatus(candidate.crm.status);
    setNotes(candidate.crm.notes);
    setTagInput((candidate.crm.tags || []).join(", "));
    setSaving(null);
  }, [candidate.login]);

  const flashSaving = () => {
    setSaving("saving");
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 420);
  };

  const handleStatus = (v) => {
    setStatus(v);
    onUpdate({ status: v });
    flashSaving();
  };
  const handleNotes = (v) => {
    setNotes(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      onUpdate({ notes: v });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };
  const handleTags = (v) => {
    setTagInput(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      const tags = v.split(",").map(x => x.trim()).filter(Boolean);
      onUpdate({ tags });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };

  const acctAge = candidate.githubCreatedAt
    ? Math.floor((Date.now() - new Date(candidate.githubCreatedAt).getTime()) / (365 * 24 * 3600 * 1000))
    : null;

  const savingLabel = saving === "saving"
    ? <span className="saving">Saving…</span>
    : saving === "saved"
    ? <span className="saving ok">✓ Saved</span>
    : null;

  return (
    <div className="aside">
      <div>
        <h3>CRM</h3>
        <div className="field">
          <label>Status {savingLabel}</label>
          <select value={status} onChange={e => handleStatus(e.target.value)}>
            <option value="new">New</option>
            <option value="reviewing">Reviewing</option>
            <option value="interested">Interested</option>
            <option value="contacted">Contacted</option>
            <option value="passed">Passed</option>
            <option value="hired">Hired</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea
          placeholder="Add a note — autosaves on blur."
          value={notes}
          onChange={e => handleNotes(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Tags <span className="dim" style={{fontSize: 10.5}}>comma-separated</span></label>
        <input
          type="text"
          placeholder="q2-batch, warm-intro"
          value={tagInput}
          onChange={e => handleTags(e.target.value)}
        />
        {(candidate.crm.tags && candidate.crm.tags.length > 0) && (
          <div className="tags-cloud" style={{ marginTop: 4 }}>
            {candidate.crm.tags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
      </div>

      <div>
        <h3>Snapshot</h3>
        <div className="qstats">
          <div className="qs">
            <div className="k">Fit</div>
            <div className="v">{candidate.profile.fitScore}/5</div>
            <div className="sub">{candidate.profile.recommendedOutreach}</div>
          </div>
          <div className="qs">
            <div className="k">Confidence</div>
            <div className="v">{Math.round(candidate.profile.confidence * 100)}%</div>
            <div className="sub">{candidate.profile.model}</div>
          </div>
          <div className="qs">
            <div className="k">Followers</div>
            <div className="v">{fmtNum(candidate.followers)}</div>
            <div className="sub">{candidate.publicRepos} repos</div>
          </div>
          <div className="qs">
            <div className="k">Account</div>
            <div className="v">{acctAge}y</div>
            <div className="sub">on GitHub</div>
          </div>
        </div>
      </div>

      <div>
        <h3>Fork</h3>
        <div style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.55 }}>
          {candidate.forkMeta.hasOwnCommits ? (
            <>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>● Own commits</span>{" "}
              <span style={{ color: "var(--fg-subtle)" }}>·</span>{" "}
              <span>{candidate.forkMeta.aheadBy} ahead, {candidate.forkMeta.behindBy} behind</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--fg-subtle)" }}>○ Clone only</span>{" "}
              <span style={{ color: "var(--fg-subtle)" }}>·</span>{" "}
              <span>{candidate.forkMeta.behindBy} behind</span>
            </>
          )}
          <div className="dim" style={{ marginTop: 2 }}>
            Last push {relTime(candidate.forkMeta.forkPushedAt)}
          </div>
        </div>
      </div>

      <div>
        <h3>Keyboard</h3>
        <div className="kbd-help">
          <div className="kb-row"><span>Back to list</span><kbd>Esc</kbd></div>
          <div className="kb-row"><span>Next / prev</span><kbd>J</kbd><kbd>K</kbd></div>
          <div className="kb-row"><span>Focus search</span><kbd>/</kbd></div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail page ───────────────────────────────────────────────────────────
function DetailView({ candidate, onBack, onPrev, onNext, onUpdate, tweaks, prevName, nextName }) {
  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const isField = tag === "input" || tag === "textarea" || tag === "select";
      if (isField) return;
      if (e.key === "Escape") { e.preventDefault(); onBack(); }
      else if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); onNext(); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, onPrev, onNext]);

  // Reset scroll on candidate change
  const mainRef = useRef(null);
  useEffect(() => { mainRef.current && (mainRef.current.scrollTop = 0); }, [candidate.login]);

  const c = candidate;
  const positives = c.signals.filter(s => s.kind === "positive");
  const negatives = c.signals.filter(s => s.kind === "negative");
  const notables  = c.signals.filter(s => s.kind === "notable");

  return (
    <div className="detail view-enter" data-sidebar={tweaks.sidebar}>
      {tweaks.sidebar === "left" && <aside className="detail-aside"><CrmPanel candidate={c} onUpdate={onUpdate} /></aside>}

      <main className="detail-main" ref={mainRef}>
        <div className="dx">
          {/* Sub-topbar — back + prev/next */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button className="tb-link" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              ← All candidates
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="filter-btn" onClick={onPrev} title={"Previous: " + prevName}>
                ↑ Prev
              </button>
              <button className="filter-btn" onClick={onNext} title={"Next: " + nextName}>
                Next ↓
              </button>
            </div>
          </div>

          {/* Header */}
          <header className="detail-header">
            <Avatar c={c} size={62} shape={tweaks.avatar} />
            <div className="h-meta">
              <div className="h-name">
                <h1>{c.name}</h1>
                <span className="login">@{c.login}</span>
                <StatusPill status={c.crm.status} />
              </div>
              {c.bio && <p className="h-bio">{c.bio}</p>}
              <div className="h-row">
                {c.location && <span>📍 {c.location}</span>}
                {c.company && <><span className="dotsep">·</span><span>🏢 {c.company}</span></>}
                <span className="dotsep">·</span>
                <a href="#" onClick={e => e.preventDefault()}>github.com/{c.login}</a>
                {c.blog && <><span className="dotsep">·</span><a href="#" onClick={e => e.preventDefault()}>{c.blog.replace("https://", "")}</a></>}
                {c.twitter && <><span className="dotsep">·</span><a href="#" onClick={e => e.preventDefault()}>@{c.twitter}</a></>}
                {c.linkedin && <><span className="dotsep">·</span><a href="#" onClick={e => e.preventDefault()}>linkedin.com/in/{c.login}</a></>}
              </div>
            </div>
          </header>

          {/* Assessment */}
          <div className="assess">
            <div className="fit-lg">
              <div className="fit-lbl">Fit</div>
              <div className="fit-num">{c.profile.fitScore}<span className="of">/5</span></div>
              <FitScore score={c.profile.fitScore} treatment="dots" />
            </div>
            <div className="body">
              <div className="h">
                <span className="sen-badge">{c.profile.seniority}</span>
                <span className="conf">
                  Confidence
                  <span className="bar"><i style={{ width: (c.profile.confidence * 100) + "%" }}></i></span>
                  {Math.round(c.profile.confidence * 100)}%
                </span>
                <span style={{ color: "var(--fg-subtle)", fontSize: 11 }}>· {c.profile.model} · generated {relTime(c.profile.generatedAt)}</span>
              </div>
              <div className="summary">{c.profile.summary}</div>
              <div className="reasoning">{c.profile.fitReasoning}</div>
              <div className="outreach">
                <span className={"verdict verdict-" + c.profile.recommendedOutreach}>
                  Outreach: {c.profile.recommendedOutreach}
                </span>
                <span className="reason">{c.profile.outreachReason}</span>
              </div>
            </div>
          </div>

          {/* Signals */}
          <section className="section">
            <div className="section-h">
              <h2>Signals</h2>
              <span className="count">{positives.length} positive · {negatives.length} negative · {notables.length} notable</span>
            </div>
            {positives.length + negatives.length + notables.length === 0 ? (
              <div className="dim" style={{ fontSize: 12.5 }}>No signals extracted.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {positives.length > 0 && (
                  <div>
                    <SubLabel label="Positive" color="#16a34a" />
                    <div className="signal-grid">
                      {positives.map((s, i) => <Signal key={i} s={s} />)}
                    </div>
                  </div>
                )}
                {negatives.length > 0 && (
                  <div>
                    <SubLabel label="Negative" color="#dc2626" />
                    <div className="signal-grid">
                      {negatives.map((s, i) => <Signal key={i} s={s} />)}
                    </div>
                  </div>
                )}
                {notables.length > 0 && (
                  <div>
                    <SubLabel label="Notable" color="#2563eb" />
                    <div className="signal-grid">
                      {notables.map((s, i) => <Signal key={i} s={s} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Skills */}
          <section className="section">
            <div className="section-h"><h2>Skills</h2><span className="count">{c.skills.length}</span></div>
            <div className="tags-cloud">
              {c.skills.map(s => <span key={s} className="tag">{s}</span>)}
            </div>
          </section>

          {/* LinkedIn */}
          {c.linkedin && !tweaks.hideLinkedin && (
            <section className="section">
              <div className="section-h"><h2>LinkedIn</h2><span className="count">{c.linkedin.connections} connections</span></div>
              <div className="li-block">
                <div className="li-head">
                  <div className="li-mark">in</div>
                  <div className="li-headline">{c.linkedin.headline}</div>
                  <div className="conn">{c.linkedin.connections} connections</div>
                </div>
                <div className="li-body">
                  <div style={{ fontSize: 11, color: "var(--fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Experience</div>
                  <div className="timeline">
                    {c.linkedin.experience.map((r, i) => (
                      <div key={i} className="role">
                        <div className="marker">{r.company[0]}</div>
                        <div>
                          <div className="title">{r.title}</div>
                          <div className="company">{r.company}</div>
                          {r.description && <div className="descr">{r.description}</div>}
                        </div>
                        <div className="dates">
                          {r.start}–{r.end}
                          <div className="dim" style={{ fontSize: 11 }}>{Math.round(r.months / 12 * 10) / 10} yr</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(c.linkedin.education.length > 0 || c.linkedin.skills.length > 0) && (
                    <div className="li-sub">
                      {c.linkedin.education.length > 0 && (
                        <div className="edu">
                          <h4>Education</h4>
                          {c.linkedin.education.map((e, i) => (
                            <div key={i} style={{ marginBottom: 8 }}>
                              <div className="school">{e.school}</div>
                              <div className="deg">{e.degree}</div>
                              <div className="yrs">{e.years}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <h4>Skills (LinkedIn)</h4>
                        <div className="tags-cloud">
                          {c.linkedin.skills.map(s => <span key={s} className="tag">{s}</span>)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Web presence */}
          {c.web.length > 0 && (
            <section className="section">
              <div className="section-h"><h2>Web Presence</h2><span className="count">{c.web.length}</span></div>
              <div className="web-list">
                {c.web.map((w, i) => <WebMention key={i} w={w} />)}
              </div>
            </section>
          )}

          {/* Top repos */}
          <section className="section">
            <div className="section-h"><h2>Top Repos</h2><span className="count">{c.repos.length}</span></div>
            <div className="repo-list">
              {c.repos.map((r, i) => <Repo key={i} r={r} />)}
            </div>
          </section>

          {/* Activity */}
          <section className="section">
            <div className="section-h"><h2>Recent Activity</h2><span className="count">{c.events.length} events</span></div>
            <div className="act-list">
              {c.events.map((e, i) => <ActivityRow key={i} e={e} />)}
            </div>
          </section>
        </div>
      </main>

      {tweaks.sidebar !== "left" && <aside className="detail-aside"><CrmPanel candidate={c} onUpdate={onUpdate} /></aside>}
    </div>
  );
}

function SubLabel({ label, color }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
      color: color, marginBottom: 6,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }}></span>
      {label}
    </div>
  );
}

Object.assign(window, { DetailView, CrmPanel, relTime, fmtDate });
