"use client";

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
    <ListKeyboardNav candidates={candidates} sort={sort}>
      {(activeIdx, setActiveIdx) =>
        candidates.map((c, i) => (
          <CandidateRow key={c.login} {...c}
            isActive={i === activeIdx}
            onClick={() => router.push(`/candidates/${c.login}`)}
            onMouseEnter={() => setActiveIdx(i)} />
        ))
      }
    </ListKeyboardNav>
  );
}
