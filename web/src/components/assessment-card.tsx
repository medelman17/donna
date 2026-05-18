import { FitDots, relTime } from "./atoms";

type Props = {
  fitScore: number; seniority: string | null; confidence: number | null;
  model: string | null; generatedAt: Date | null; summary: string | null;
  fitReasoning: string | null; recommendedOutreach: string | null; outreachReason: string | null;
};

export function AssessmentCard({
  fitScore, seniority, confidence, model, generatedAt,
  summary, fitReasoning, recommendedOutreach, outreachReason,
}: Props) {
  const confPct = confidence != null ? Math.round(confidence * 100) : null;
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
