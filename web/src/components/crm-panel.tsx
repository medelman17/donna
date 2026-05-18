"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { updateCrm } from "@/app/candidates/[login]/actions";
import { fmtNum } from "./atoms";

type Props = {
  login: string; status: string; bookmarked: boolean; notes: string | null; tags: string | null;
  fitScore: number | null; recommendedOutreach: string | null;
  confidence: number | null; model: string | null;
  email: string | null; name: string | null; bio: string | null;
  blog: string | null; company: string | null; twitter: string | null;
  htmlUrl: string | null; linkedInUrl: string | null;
  followers: number; publicRepos: number; githubCreatedAt: Date | null;
  hasOwnCommits: boolean; aheadBy: number; behindBy: number; forkPushedAt: Date | null;
  openToWork: string | null; aiExperience: string | null;
  legalTechRelevance: string | null; seniority: string | null;
};

const TABS = [
  { id: "details", label: "Details" },
  { id: "notes", label: "Notes" },
] as const;

type TabId = typeof TABS[number]["id"];

export function CrmPanel({
  login, status: initStatus, bookmarked: initBookmarked, notes: initNotes, tags: initTags,
  fitScore, recommendedOutreach, confidence, model,
  email, name, bio, blog, company, twitter, htmlUrl, linkedInUrl,
  followers, publicRepos, githubCreatedAt,
  hasOwnCommits, aheadBy, behindBy,
  openToWork, aiExperience, legalTechRelevance, seniority,
}: Props) {
  const [status, setStatus] = useState(initStatus);
  const [bookmarked, setBookmarked] = useState(initBookmarked);
  const [notes, setNotes] = useState(initNotes ?? "");
  const [tagInput, setTagInput] = useState(initTags ?? "");
  const [saving, setSaving] = useState<null | "saving" | "saved">(null);
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const debRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current[activeTab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [activeTab]);

  useLayoutEffect(updateIndicator, [updateIndicator]);
  useEffect(() => { window.addEventListener("resize", updateIndicator); return () => window.removeEventListener("resize", updateIndicator); }, [updateIndicator]);

  useEffect(() => {
    setStatus(initStatus);
    setBookmarked(initBookmarked);
    setNotes(initNotes ?? "");
    setTagInput(initTags ?? "");
    setSaving(null);
  }, [login, initStatus, initBookmarked, initNotes, initTags]);

  const flash = () => {
    setSaving("saving");
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setSaving("saved"); setTimeout(() => setSaving(null), 1400); }, 420);
  };

  const handleStatus = (v: string) => { setStatus(v); updateCrm(login, { status: v }); flash(); };
  const handleBookmark = () => { const next = !bookmarked; setBookmarked(next); updateCrm(login, { bookmarked: next }); flash(); };
  const handleNotes = (v: string) => {
    setNotes(v); clearTimeout(debRef.current); setSaving("saving");
    debRef.current = setTimeout(() => { updateCrm(login, { notes: v }); setSaving("saved"); setTimeout(() => setSaving(null), 1400); }, 600);
  };
  const handleTags = (v: string) => {
    setTagInput(v); clearTimeout(debRef.current); setSaving("saving");
    debRef.current = setTimeout(() => { updateCrm(login, { tags: v }); setSaving("saved"); setTimeout(() => setSaving(null), 1400); }, 600);
  };

  const acctAge = githubCreatedAt ? Math.floor((Date.now() - new Date(githubCreatedAt).getTime()) / (365 * 24 * 3600 * 1000)) : null;
  const savedTags = tagInput.split(",").map(t => t.trim()).filter(Boolean);
  const savingEl = saving === "saving" ? <span className="saving">Saving…</span> : saving === "saved" ? <span className="saving ok">✓ Saved</span> : null;

  const quickFacts = [
    openToWork && openToWork !== "unknown" && openToWork !== "no" && { label: "Open to Work", value: openToWork },
    seniority && seniority !== "unknown" && { label: "Seniority", value: seniority },
    aiExperience && aiExperience !== "unknown" && aiExperience !== "none" && { label: "AI", value: aiExperience },
    legalTechRelevance && legalTechRelevance !== "unknown" && legalTechRelevance !== "none" && { label: "Legal Tech", value: legalTechRelevance },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="aside">
      {/* Tab bar at very top */}
      <div style={{ position: "relative", borderBottom: "1px solid var(--color-border)", margin: "-14px -14px 0", padding: "0 14px" }}>
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[tab.id] = el; }}
              onClick={() => setActiveTab(tab.id)}
              style={{
                appearance: "none", border: "none", background: "transparent", cursor: "pointer",
                padding: "10px 14px", fontSize: 12, fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "var(--color-fg)" : "var(--color-fg-subtle)",
                transition: "color 0.15s",
              }}
            >{tab.label}</button>
          ))}
        </div>
        <div style={{
          position: "absolute", bottom: -1, height: 2, borderRadius: 1,
          background: "var(--color-accent)",
          left: indicator.left, width: indicator.width,
          transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>

      {/* Details tab */}
      {activeTab === "details" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status + Tags */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-fg-subtle)", width: 48, flexShrink: 0 }}>Status</label>
              <select value={status} onChange={e => handleStatus(e.target.value)}
                style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg-2)", color: "var(--color-fg)", flex: 1 }}>
                {["new", "enriched", "reviewing", "interested", "contacted", "passed", "hired"].map(s => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              {savingEl}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-fg-subtle)", width: 48, flexShrink: 0 }}>Tags</label>
              <input type="text" placeholder="q2-batch, warm-intro" value={tagInput} onChange={e => handleTags(e.target.value)}
                style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", background: "var(--color-bg-2)", color: "var(--color-fg)", fontFamily: "inherit", flex: 1 }} />
            </div>
            {savedTags.length > 0 && (
              <div className="tags-cloud" style={{ marginTop: 4, marginLeft: 56 }}>
                {savedTags.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
          </div>

          {/* Links */}
          {(() => {
            const links = [
              htmlUrl && { icon: "GH", label: login, href: htmlUrl },
              email && { icon: "✉", label: email, href: `mailto:${email}` },
              linkedInUrl && { icon: "in", label: "LinkedIn", href: linkedInUrl },
              twitter && { icon: "𝕏", label: `@${twitter}`, href: `https://x.com/${twitter}` },
              blog && { icon: "🔗", label: blog.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: blog.startsWith("http") ? blog : `https://${blog}` },
            ].filter(Boolean) as { icon: string; label: string; href: string }[];
            return links.length > 0 ? (
              <div>
                <h3>Links</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {links.map(l => (
                    <a key={l.href} href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", gap: 8, fontSize: 12,
                        color: "var(--color-fg-muted)", textDecoration: "none",
                        padding: "3px 0", transition: "color 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--color-accent)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--color-fg-muted)")}
                    >
                      <span style={{
                        width: 20, height: 20, borderRadius: 4, background: "var(--color-bg-2)",
                        border: "1px solid var(--color-border)", display: "grid", placeItems: "center",
                        fontSize: 10, fontWeight: 700, flexShrink: 0, lineHeight: 1,
                      }}>{l.icon}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* Snapshot */}
          <div>
            <h3>Snapshot</h3>
            <div className="qstats">
              <div className="qs"><div className="k">Fit</div><div className="v">{fitScore ?? "—"}/5</div><div className="sub">{recommendedOutreach ?? "—"}</div></div>
              <div className="qs"><div className="k">Confidence</div><div className="v">{confidence != null ? Math.round(confidence * 100) + "%" : "—"}</div><div className="sub">{model ?? "—"}</div></div>
              <div className="qs"><div className="k">Followers</div><div className="v">{fmtNum(followers)}</div><div className="sub">{publicRepos} repos</div></div>
              <div className="qs"><div className="k">Account</div><div className="v">{acctAge != null ? acctAge + "y" : "—"}</div><div className="sub">on GitHub</div></div>
            </div>
            {quickFacts.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {quickFacts.map(f => (
                  <span key={f.label} style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 4,
                    background: "var(--color-bg-2)", border: "1px solid var(--color-border)",
                    color: "var(--color-fg-muted)", fontWeight: 500,
                  }}>{f.label}: {f.value}</span>
                ))}
              </div>
            )}
          </div>

          {/* Triage */}
          {(followers > 0 || publicRepos > 0) && (() => {
            const profileDepth = [name, bio, blog, twitter, company].filter(Boolean).length;
            const repoScore = Math.min(5, Math.floor(publicRepos / 3));
            const socialScore = Math.min(5, followers < 2 ? 0 : followers < 10 ? 1 : followers < 50 ? 2 : followers < 200 ? 3 : followers < 1000 ? 4 : 5);
            const ageScore = acctAge != null ? Math.min(5, acctAge) : 0;
            const total = profileDepth + repoScore + socialScore + ageScore;
            const verdict = total < 4 ? "SKIP" : total < 8 ? "LIGHT" : "INVESTIGATE";
            const vColor = { SKIP: "#8a8a96", LIGHT: "#8a6a1f", INVESTIGATE: "#0f6b32" }[verdict] ?? "#8a8a96";
            const dims = [
              { label: "Profile", score: profileDepth, max: 5 },
              { label: "Repos", score: repoScore, max: 5 },
              { label: "Social", score: socialScore, max: 5 },
              { label: "Account", score: ageScore, max: 5 },
            ];
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3>Triage</h3>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 999, color: vColor, background: `color-mix(in oklab, ${vColor}, transparent 88%)` }}>{verdict}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {dims.map(d => (
                    <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                      <span style={{ width: 48, color: "var(--color-fg-muted)", fontWeight: 500 }}>{d.label}</span>
                      <div style={{ display: "flex", gap: 2, flex: 1 }}>
                        {Array.from({ length: d.max }, (_, j) => (
                          <div key={j} style={{ width: 14, height: 4, borderRadius: 1, background: j < d.score ? "var(--color-accent)" : "var(--color-border)" }} />
                        ))}
                      </div>
                      <span style={{ color: "var(--color-fg-subtle)", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{d.score}/{d.max}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Fork */}
          <div>
            <h3>Fork</h3>
            <div style={{ fontSize: 12.5, color: "var(--color-fg-muted)", lineHeight: 1.55 }}>
              {hasOwnCommits ? (
                <><span style={{ color: "#16a34a", fontWeight: 600 }}>● Own commits</span> <span style={{ color: "var(--color-fg-subtle)" }}>·</span> <span>{aheadBy} ahead, {behindBy} behind</span></>
              ) : (
                <><span style={{ color: "var(--color-fg-subtle)" }}>○ Clone only</span> <span style={{ color: "var(--color-fg-subtle)" }}>·</span> <span>{behindBy} behind</span></>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Notes tab */}
      {activeTab === "notes" && (
        <div style={{ paddingTop: 4 }}>
          <textarea
            placeholder="Add notes about this candidate..."
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            style={{ width: "100%", minHeight: 280, fontSize: 13, lineHeight: 1.6, padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)", background: "var(--color-bg-2)", color: "var(--color-fg)", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      )}

      {/* Keyboard rail — pinned to bottom */}
      <div style={{
        marginTop: "auto", padding: "8px 0 0",
        borderTop: "1px solid var(--color-border)",
        display: "flex", alignItems: "center", gap: 12,
        fontSize: 10.5, color: "var(--color-fg-subtle)",
      }}>
        <span><kbd>Esc</kbd> list</span>
        <span><kbd>J</kbd><kbd>K</kbd> nav</span>
        <span><kbd>/</kbd> search</span>
      </div>
    </div>
  );
}
