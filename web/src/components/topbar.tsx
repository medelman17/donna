import Link from "next/link";
import { prisma } from "@/lib/prisma";

type Props = {
  candidateLogin?: string;
};

export async function Topbar({ candidateLogin }: Props) {
  const [candidates, enriched, analyzed] = await Promise.all([
    prisma.candidate.count(),
    prisma.repo.findMany({ select: { candidateLogin: true }, distinct: ["candidateLogin"] }).then(r => r.length),
    prisma.profile.count(),
  ]);

  return (
    <div className="topbar">
      <div className="logo">
        <div className="logo-mark">T</div>
        <span>Talent Scout</span>
      </div>
      <span className="crumb">
        / <Link href="/">willchen96/mike</Link>
        {candidateLogin && (
          <> / <span style={{ color: "var(--color-fg-muted)" }}>@{candidateLogin}</span></>
        )}
      </span>
      <div className="spacer" />
      <div className="meta">
        <Link href="/settings" style={{ fontSize: 12, color: "var(--color-fg-muted)", textDecoration: "none" }}>Settings</Link>
        <span className="live-pill">
          <span className="live-dot" />
          Pipeline ready
        </span>
        <span>{candidates} forkers · {enriched} enriched · {analyzed} analyzed</span>
      </div>
    </div>
  );
}
