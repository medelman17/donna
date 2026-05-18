"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "seeding" | "hydrating" | "done" | "error";

export function SeedingState() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("seeding");
  const [seedResult, setSeedResult] = useState<{ ingested: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const seedRes = await fetch("/api/seed", { method: "POST" });
        const seedData = await seedRes.json();
        if (cancelled) return;
        setSeedResult(seedData);

        setStatus("hydrating");
        await fetch("/api/seed/hydrate", { method: "POST" });
        if (cancelled) return;

        setStatus("done");
        setTimeout(() => router.refresh(), 600);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="empty seed-state">
      {status === "seeding" && (
        <>
          <div className="seed-spinner" />
          <div style={{ fontWeight: 600 }}>Seeding candidates&hellip;</div>
          <div className="dim" style={{ fontSize: 13, maxWidth: 340 }}>
            Fetching forkers, contributors, issue &amp; PR authors, and
            stargazers from GitHub.
          </div>
        </>
      )}
      {status === "hydrating" && (
        <>
          <div className="seed-spinner" />
          <div style={{ fontWeight: 600 }}>
            Loaded {seedResult?.total ?? 0} candidates &mdash; fetching profiles&hellip;
          </div>
          <div className="dim" style={{ fontSize: 13, maxWidth: 340 }}>
            Pulling follower counts, repos, bios, and locations from GitHub so
            you can sort before enriching.
          </div>
        </>
      )}
      {status === "done" && seedResult && (
        <>
          <div className="glyph">✓</div>
          <div style={{ fontWeight: 600 }}>
            Loaded {seedResult.ingested} candidates ({seedResult.total} total)
          </div>
        </>
      )}
      {status === "error" && (
        <>
          <div className="glyph">✕</div>
          <div style={{ fontWeight: 600 }}>Seeding failed</div>
          <button className="tb-link" style={{ marginTop: 4 }}
            onClick={() => window.location.reload()}>
            Try again
          </button>
        </>
      )}
    </div>
  );
}
