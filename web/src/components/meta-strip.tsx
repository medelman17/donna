type Props = {
  filtered: number;
  total: number;
  avgFit: string;
  ownCommitsForks: number;
  byStatus: Record<string, number>;
};

export function MetaStrip({ filtered, total, avgFit, ownCommitsForks, byStatus }: Props) {
  return (
    <div className="metastrip">
      <span><b>{filtered}</b> of <b>{total}</b> candidates</span>
      <span>Avg fit <b>{avgFit}</b></span>
      <span>Own-commits forks <b>{ownCommitsForks}</b></span>
      <span style={{ flex: 1 }} />
      <span>
        <b>{byStatus.new ?? 0}</b> new · <b>{byStatus.reviewing ?? 0}</b> reviewing ·{" "}
        <b>{byStatus.interested ?? 0}</b> interested · <b>{byStatus.contacted ?? 0}</b> contacted ·{" "}
        <b>{byStatus.passed ?? 0}</b> passed · <b>{byStatus.hired ?? 0}</b> hired
      </span>
    </div>
  );
}
