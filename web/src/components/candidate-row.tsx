import { Avatar } from "./avatar";
import { StatusPill, FitChip, LangBadge, fmtNum } from "./atoms";

type Props = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; status: string; seniority: string | null;
  bookmarked: boolean; topLanguages: string[];
  followers: number; publicRepos: number;
  totalCommits: number;
  isActive: boolean; isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onClick: () => void;
  onMouseEnter: () => void;
};

export function CandidateRow({
  login, name, avatarUrl, location, summary, fitScore, status, seniority,
  bookmarked, topLanguages, followers, publicRepos, totalCommits,
  isActive, isSelected, onSelect, onClick, onMouseEnter,
}: Props) {
  return (
    <div className="row" data-active={isActive || undefined} data-selected={isSelected || undefined}
      onClick={onClick} onMouseEnter={onMouseEnter}>
      <div style={{ display: "grid", placeItems: "center" }}
        onClick={e => { e.stopPropagation(); onSelect(e); }}>
        <input type="checkbox" checked={isSelected} readOnly
          style={{ cursor: "pointer", accentColor: "var(--color-accent)" }} />
      </div>
      <div className="who">
        <Avatar name={name} login={login} avatarUrl={avatarUrl} size={22} />
        <div className="who-stack">
          <div className="name">
            {bookmarked && <span style={{ color: "#f59e0b", marginRight: 3 }} title="Bookmarked">★</span>}
            {name || login} <span className="login">@{login}</span>
          </div>
        </div>
      </div>
      <div className="fit-cell">
        {fitScore != null ? <FitChip score={fitScore} /> : <span className="dim">—</span>}
      </div>
      <div className="summary" title={summary ?? undefined}>{summary || <span className="dim">—</span>}</div>
      <div className="loc">{location || <span className="dim">—</span>}</div>
      <div className="stat">
        {seniority && seniority !== "unknown" ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 5px",
            borderRadius: 3, background: "var(--color-bg-2)",
            color: "var(--color-fg-muted)", textTransform: "capitalize",
            whiteSpace: "nowrap",
          }}>{seniority}</span>
        ) : <span className="dim">—</span>}
      </div>
      <div className="langs">
        {topLanguages.slice(0, 3).map(l => <LangBadge key={l} name={l} />)}
      </div>
      <div className="nums">{fmtNum(followers)}</div>
      <div className="nums">{publicRepos}</div>
      <div className="nums">{totalCommits > 0 ? fmtNum(totalCommits) : <span className="dim">—</span>}</div>
      <div className="stat"><StatusPill status={status} /></div>
    </div>
  );
}
