type Signal = { kind: string; text: string };

function SubLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const,
      letterSpacing: "0.06em", color, marginBottom: 6,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}

export function SignalList({ signals }: { signals: Signal[] }) {
  const positives = signals.filter(s => s.kind === "positive");
  const negatives = signals.filter(s => s.kind === "negative");
  const notables = signals.filter(s => s.kind === "notable");

  if (positives.length + negatives.length + notables.length === 0) {
    return <div className="dim" style={{ fontSize: 12.5 }}>No signals extracted.</div>;
  }

  const renderGroup = (items: Signal[], kind: string, icon: string) => (
    <div className="signal-grid">
      {items.map((s, i) => (
        <div key={i} className="signal" data-kind={kind}>
          <span className="ico">{icon}</span>
          <span className="text">{s.text}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {positives.length > 0 && <div><SubLabel label="Positive" color="#16a34a" />{renderGroup(positives, "positive", "+")}</div>}
      {negatives.length > 0 && <div><SubLabel label="Negative" color="#dc2626" />{renderGroup(negatives, "negative", "−")}</div>}
      {notables.length > 0 && <div><SubLabel label="Notable" color="#2563eb" />{renderGroup(notables, "notable", "·")}</div>}
    </div>
  );
}
