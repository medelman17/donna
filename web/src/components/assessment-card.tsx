import { FitDots, relTime } from "./atoms";

type Props = {
  fitScore: number; seniority: string | null; confidence: number | null;
  model: string | null; generatedAt: Date | null; summary: string | null;
  fitReasoning: string | null; recommendedOutreach: string | null; outreachReason: string | null;
  openToWork: string | null; isLawyer: string | null; hasOwnCompany: string | null;
  companyName: string | null; aiExperience: string | null; legalTechRelevance: string | null;
  communityActivity: string | null; influenceLevel: string | null;
};

const CATEGORY_PILLS: { key: keyof Props; label: string; colorMap: Record<string, string> }[] = [
  { key: "openToWork", label: "Open to Work", colorMap: { yes: "#16a34a", no: "#8a8a96", unknown: "#8a8a96" } },
  { key: "isLawyer", label: "Lawyer", colorMap: { yes: "#7c3aed", no: "#8a8a96", unknown: "#8a8a96" } },
  { key: "hasOwnCompany", label: "Founder", colorMap: { yes: "#ea580c", no: "#8a8a96", unknown: "#8a8a96" } },
  { key: "aiExperience", label: "AI", colorMap: { advanced: "#2563eb", intermediate: "#3b82f6", basic: "#60a5fa", none: "#8a8a96", unknown: "#8a8a96" } },
  { key: "legalTechRelevance", label: "Legal Tech", colorMap: { deep: "#7c3aed", adjacent: "#a78bfa", transferable: "#c4b5fd", none: "#8a8a96", unknown: "#8a8a96" } },
  { key: "communityActivity", label: "Community", colorMap: { high: "#16a34a", moderate: "#4ade80", low: "#86efac", none: "#8a8a96", unknown: "#8a8a96" } },
  { key: "influenceLevel", label: "Influence", colorMap: { notable: "#f59e0b", established: "#fbbf24", emerging: "#fcd34d", none: "#8a8a96", unknown: "#8a8a96" } },
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
    return val && val !== "unknown" && val !== "none";
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
              const color = p.colorMap[val] ?? "#8a8a96";
              const displayVal = p.key === "hasOwnCompany" && companyName ? companyName : val;
              return (
                <span key={p.key} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                  background: `color-mix(in oklab, ${color}, transparent 88%)`,
                  color: color, border: `1px solid color-mix(in oklab, ${color}, transparent 70%)`,
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
