import { FitDots, relTime } from "./atoms";

type Props = {
  fitScore: number; seniority: string | null; confidence: number | null;
  model: string | null; generatedAt: Date | null; summary: string | null;
  fitReasoning: string | null; recommendedOutreach: string | null; outreachReason: string | null;
  openToWork: string | null; isLawyer: string | null; hasOwnCompany: string | null;
  companyName: string | null; aiExperience: string | null; legalTechRelevance: string | null;
  communityActivity: string | null; influenceLevel: string | null;
};

const CATEGORY_PILLS: { key: keyof Props; label: string; hide?: string[]; colorMap: Record<string, string> }[] = [
  { key: "openToWork", label: "Open to Work", hide: ["no"], colorMap: { yes: "#15803d" } },
  { key: "isLawyer", label: "Lawyer", hide: ["no"], colorMap: { yes: "#6d28d9" } },
  { key: "hasOwnCompany", label: "Founder", hide: ["no"], colorMap: { yes: "#c2410c" } },
  { key: "aiExperience", label: "AI", colorMap: { advanced: "#1d4ed8", intermediate: "#2563eb", basic: "#6b7280" } },
  { key: "legalTechRelevance", label: "Legal Tech", colorMap: { deep: "#6d28d9", adjacent: "#7c3aed", transferable: "#6b7280" } },
  { key: "communityActivity", label: "Community", colorMap: { high: "#15803d", moderate: "#16a34a", low: "#6b7280" } },
  { key: "influenceLevel", label: "Influence", colorMap: { notable: "#b45309", established: "#d97706", emerging: "#6b7280" } },
];

export function AssessmentCard({
  fitScore, seniority, confidence, model, generatedAt,
  summary, fitReasoning, recommendedOutreach, outreachReason,
  openToWork, isLawyer, hasOwnCompany, companyName,
  aiExperience, legalTechRelevance, communityActivity, influenceLevel,
}: Props) {
  const confPct = confidence != null ? Math.round(confidence * 100) : null;
  const props = { openToWork, isLawyer, hasOwnCompany, companyName, aiExperience, legalTechRelevance, communityActivity, influenceLevel } as Props;

  const visiblePills = CATEGORY_PILLS.filter(p => {
    const val = props[p.key] as string | null;
    if (!val || val === "unknown" || val === "none") return false;
    if (p.hide?.includes(val)) return false;
    return true;
  });

  return (
    <div className="assess">
      <div className="fit-lg">
        <div className="fit-lbl">Fit</div>
        <div className="fit-num">{fitScore}<span className="of">/5</span></div>
        <FitDots score={fitScore} />
      </div>
      <div className="body">
        <div className="h">
          {seniority && <span className="sen-badge">{seniority}</span>}
          {confPct != null && (
            <span className="conf">
              Confidence
              <span className="bar"><i style={{ width: `${confPct}%` }} /></span>
              {confPct}%
            </span>
          )}
          <span style={{ color: "var(--color-fg-subtle)", fontSize: 11 }}>
            · {model} · generated {relTime(generatedAt)}
          </span>
        </div>

        {visiblePills.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 4px" }}>
            {visiblePills.map(p => {
              const val = props[p.key] as string;
              const color = p.colorMap[val] ?? "#6b7280";
              const isSubtle = color === "#6b7280";
              const displayVal = p.key === "hasOwnCompany" && companyName ? companyName : val;
              return (
                <span key={p.key} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: isSubtle ? "#f3f4f6" : `color-mix(in oklab, ${color}, transparent 82%)`,
                  color: color, border: `1px solid color-mix(in oklab, ${color}, transparent 55%)`,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                  {p.label}: {displayVal}
                </span>
              );
            })}
          </div>
        )}

        {summary && <div className="summary">{summary}</div>}
        {fitReasoning && <div className="reasoning">{fitReasoning}</div>}
        {recommendedOutreach && (
          <div className="outreach">
            <span className={`verdict verdict-${recommendedOutreach}`}>
              Outreach: {recommendedOutreach}
            </span>
            {outreachReason && <span style={{ color: "var(--color-fg-muted)", lineHeight: 1.5 }}>{outreachReason}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
