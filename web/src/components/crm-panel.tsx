"use client";

import { useState, useRef, useEffect } from "react";
import { updateCrm } from "@/app/candidates/[login]/actions";
import { fmtNum } from "./atoms";

type Props = {
  login: string; status: string; bookmarked: boolean; notes: string | null; tags: string | null;
  fitScore: number | null; recommendedOutreach: string | null;
  confidence: number | null; model: string | null;
  followers: number; publicRepos: number; githubCreatedAt: Date | null;
  hasOwnCommits: boolean; aheadBy: number; behindBy: number; forkPushedAt: Date | null;
};

export function CrmPanel({
  login, status: initStatus, bookmarked: initBookmarked, notes: initNotes, tags: initTags,
  fitScore, recommendedOutreach, confidence, model,
  followers, publicRepos, githubCreatedAt,
  hasOwnCommits, aheadBy, behindBy, forkPushedAt,
}: Props) {
  const [status, setStatus] = useState(initStatus);
  const [bookmarked, setBookmarked] = useState(initBookmarked);
  const [notes, setNotes] = useState(initNotes ?? "");
  const [tagInput, setTagInput] = useState(initTags ?? "");
  const [saving, setSaving] = useState<null | "saving" | "saved">(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    debRef.current = setTimeout(() => {
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 420);
  };

  const handleStatus = (v: string) => {
    setStatus(v);
    updateCrm(login, { status: v });
    flash();
  };
  const handleNotes = (v: string) => {
    setNotes(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      updateCrm(login, { notes: v });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };
  const handleTags = (v: string) => {
    setTagInput(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      updateCrm(login, { tags: v });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };

  const acctAge = githubCreatedAt
    ? Math.floor((Date.now() - new Date(githubCreatedAt).getTime()) / (365 * 24 * 3600 * 1000))
    : null;

  const savingEl = saving === "saving"
    ? <span className="saving">Saving…</span>
    : saving === "saved"
    ? <span className="saving ok">✓ Saved</span>
    : null;

  const savedTags = tagInput.split(",").map(t => t.trim()).filter(Boolean);

  const handleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    updateCrm(login, { bookmarked: next });
    flash();
  };

  return (
    <div className="aside">
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3>CRM</h3>
          <button
            onClick={handleBookmark}
            title={bookmarked ? "Remove bookmark" : "Bookmark this candidate"}
            style={{
              appearance: "none",
              border: "1px solid " + (bookmarked ? "color-mix(in oklab, #f59e0b, transparent 40%)" : "var(--color-border)"),
              background: bookmarked ? "color-mix(in oklab, #f59e0b, transparent 90%)" : "transparent",
              color: bookmarked ? "#f59e0b" : "var(--color-fg-subtle)",
              borderRadius: "var(--radius-DEFAULT)",
              padding: "3px 10px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            {bookmarked ? "★" : "☆"} {bookmarked ? "Saved" : "Save"}
          </button>
        </div>
        <div className="field">
          <label>Status {savingEl}</label>
          <select value={status} onChange={e => handleStatus(e.target.value)}>
            {["new", "reviewing", "interested", "contacted", "passed", "hired"].map(s => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea placeholder="Add a note — autosaves." value={notes} onChange={e => handleNotes(e.target.value)} />
      </div>
      <div className="field">
        <label>Tags <span className="dim" style={{ fontSize: 10.5 }}>comma-separated</span></label>
        <input type="text" placeholder="q2-batch, warm-intro" value={tagInput} onChange={e => handleTags(e.target.value)} />
        {savedTags.length > 0 && (
          <div className="tags-cloud" style={{ marginTop: 4 }}>
            {savedTags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
      </div>
      <div>
        <h3>Snapshot</h3>
        <div className="qstats">
          <div className="qs"><div className="k">Fit</div><div className="v">{fitScore ?? "—"}/5</div><div className="sub">{recommendedOutreach ?? "—"}</div></div>
          <div className="qs"><div className="k">Confidence</div><div className="v">{confidence != null ? Math.round(confidence * 100) + "%" : "—"}</div><div className="sub">{model ?? "—"}</div></div>
          <div className="qs"><div className="k">Followers</div><div className="v">{fmtNum(followers)}</div><div className="sub">{publicRepos} repos</div></div>
          <div className="qs"><div className="k">Account</div><div className="v">{acctAge != null ? acctAge + "y" : "—"}</div><div className="sub">on GitHub</div></div>
        </div>
      </div>
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
