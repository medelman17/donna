export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`st-pill st-${status}`}>
      <span className="dot" />
      <span>{status[0].toUpperCase() + status.slice(1)}</span>
    </span>
  );
}

export function FitChip({ score }: { score: number }) {
  return (
    <span className={`fit-chip fit-${score}`}>
      {score}<span style={{ opacity: 0.55, marginLeft: 1, fontWeight: 500 }}>/5</span>
    </span>
  );
}

export function FitDots({ score }: { score: number }) {
  return (
    <span className="fit-dots" data-tier={score}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`d${i <= score ? " on" : ""}`} />
      ))}
    </span>
  );
}

export function LangBadge({ name }: { name: string }) {
  const dotClass = `dot dot-${name.replace("+", "p")}`;
  return (
    <span className="lang">
      <span className={dotClass} />
      <span>{name}</span>
    </span>
  );
}

export function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function relTime(iso: string | Date | null): string {
  if (!iso) return "—";
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
