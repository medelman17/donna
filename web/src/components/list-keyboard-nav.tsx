"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type CandidateRef = { login: string };

export function ListKeyboardNav({
  candidates,
  children,
  sort,
}: {
  candidates: CandidateRef[];
  children: (activeIdx: number, setActiveIdx: (i: number) => void) => React.ReactNode;
  sort: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => { setActiveIdx(0); }, [candidates.length, sort]);

  useEffect(() => {
    if (activeIdx >= candidates.length) setActiveIdx(Math.max(0, candidates.length - 1));
  }, [candidates.length, activeIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(candidates.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = candidates[activeIdx];
        if (c) router.push(`/candidates/${c.login}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, activeIdx, router]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!el || !scrollRef.current) return;
    const er = el.getBoundingClientRect();
    const pr = scrollRef.current.getBoundingClientRect();
    if (er.top < pr.top + 40) scrollRef.current.scrollTop -= (pr.top + 40 - er.top);
    else if (er.bottom > pr.bottom - 8) scrollRef.current.scrollTop += (er.bottom - pr.bottom + 8);
  }, [activeIdx]);

  const cols = "minmax(220px, 1.4fr) 90px minmax(280px, 2.4fr) minmax(140px, 1.1fr) 168px 70px 70px 90px 110px";

  return (
    <div style={{ "--cols": cols, display: "contents" } as React.CSSProperties}>
      <div className="row-head">
        <div>Candidate</div>
        <div>Fit</div>
        <div>Summary</div>
        <div>Location</div>
        <div>Languages</div>
        <div style={{ textAlign: "right" }}>Followers</div>
        <div style={{ textAlign: "right" }}>Repos</div>
        <div>Fork</div>
        <div>Status</div>
      </div>
      <div className="list-scroll" ref={scrollRef}>
        {children(activeIdx, setActiveIdx)}
      </div>
    </div>
  );
}
