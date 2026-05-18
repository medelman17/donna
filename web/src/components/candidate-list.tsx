"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CandidateRow } from "./candidate-row";
import { ListKeyboardNav } from "./list-keyboard-nav";

type CandidateData = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; seniority: string | null;
  status: string; bookmarked: boolean; topLanguages: string[];
  followers: number; publicRepos: number;
  hasOwnCommits: boolean; aheadBy: number;
};

export function CandidateList({ candidates, sort }: { candidates: CandidateData[]; sort: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState(false);
  const [lastClickIdx, setLastClickIdx] = useState<number | null>(null);

  const toggle = useCallback((login: string, idx: number, shiftKey: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastClickIdx != null) {
        const from = Math.min(lastClickIdx, idx);
        const to = Math.max(lastClickIdx, idx);
        for (let i = from; i <= to; i++) next.add(candidates[i].login);
      } else {
        if (next.has(login)) next.delete(login);
        else next.add(login);
      }
      return next;
    });
    setLastClickIdx(idx);
  }, [candidates, lastClickIdx]);

  const toggleAll = useCallback(() => {
    setSelected(prev =>
      prev.size === candidates.length
        ? new Set()
        : new Set(candidates.map(c => c.login))
    );
  }, [candidates]);

  const enrichSelected = useCallback(async () => {
    if (selected.size === 0) return;
    setEnriching(true);
    try {
      await fetch("/api/enrich/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logins: [...selected] }),
      });
    } catch (e) {
      console.error("Batch enrich failed:", e);
    }
    setEnriching(false);
    setSelected(new Set());
  }, [selected]);

  if (candidates.length === 0) {
    return (
      <div className="empty">
        <div className="glyph">∅</div>
        <div>No candidates match these filters.</div>
        <button className="tb-link" style={{ marginTop: 4 }} onClick={() => router.push("/")}>
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <>
      <ListKeyboardNav candidates={candidates} sort={sort}
        selected={selected} onToggleAll={toggleAll}>
        {(activeIdx, setActiveIdx) =>
          candidates.map((c, i) => (
            <CandidateRow key={c.login} {...c}
              isActive={i === activeIdx}
              isSelected={selected.has(c.login)}
              onSelect={(e) => toggle(c.login, i, e.shiftKey)}
              onClick={() => router.push(`/candidates/${c.login}`)}
              onMouseEnter={() => setActiveIdx(i)} />
          ))
        }
      </ListKeyboardNav>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
          <button className="bulk-btn" onClick={enrichSelected} disabled={enriching}>
            {enriching ? "Queuing..." : `▶ Enrich ${selected.size}`}
          </button>
          <button className="bulk-btn-clear" onClick={() => setSelected(new Set())}>
            ✕ Clear
          </button>
        </div>
      )}
    </>
  );
}
