type LinkedInData = {
  headline: string | null; connectionCount: number | null;
  experience: string | null; education: string | null;
  skills: string | null; recentActivity: string | null;
  profileUrl: string | null;
};

function tryParseArray(val: string | null): any[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function splitLines(val: string | null): string[] {
  if (!val) return [];
  return val.split("\n").map(l => l.trim()).filter(Boolean);
}

export function LinkedInBlock({ li }: { li: LinkedInData }) {
  const expArray = tryParseArray(li.experience);
  const eduArray = tryParseArray(li.education);
  const skillArray = tryParseArray(li.skills);

  const expLines = expArray.length === 0 ? splitLines(li.experience) : [];
  const eduLines = eduArray.length === 0 ? splitLines(li.education) : [];
  const skillLines = skillArray.length === 0 && li.skills ? li.skills.split(",").map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="li-block">
      <div className="li-head">
        <div className="li-mark">in</div>
        <div className="li-headline">{li.headline}</div>
        {li.connectionCount != null && <div className="li-conn">{li.connectionCount} connections</div>}
        {li.profileUrl && (
          <a href={li.profileUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--color-accent)", marginLeft: "auto" }}>View</a>
        )}
      </div>
      <div className="li-body">
        {expArray.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Experience</div>
            <div className="timeline">
              {expArray.map((r: any, i: number) => (
                <div key={i} className="role">
                  <div className="marker">{(r.company || "?")[0]}</div>
                  <div>
                    <div className="title">{r.title}</div>
                    <div className="company">{r.company}</div>
                    {r.description && <div className="descr">{r.description}</div>}
                  </div>
                  <div className="dates">{r.duration || ""}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {expLines.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Experience</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--color-fg-muted)" }}>
              {expLines.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </>
        )}

        {(eduArray.length > 0 || eduLines.length > 0 || skillArray.length > 0 || skillLines.length > 0) && (
          <div className="li-sub">
            {eduArray.length > 0 && (
              <div>
                <h4>Education</h4>
                {eduArray.map((e: any, i: number) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="school">{e.school}</div>
                    {e.degree && <div className="deg">{e.degree} {e.field || ""}</div>}
                    {e.years && <div className="yrs">{e.years}</div>}
                  </div>
                ))}
              </div>
            )}
            {eduLines.length > 0 && (
              <div>
                <h4>Education</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--color-fg-muted)" }}>
                  {eduLines.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              </div>
            )}
            {skillArray.length > 0 && (
              <div>
                <h4>Skills (LinkedIn)</h4>
                <div className="tags-cloud">{skillArray.map((s: string) => <span key={s} className="tag">{s}</span>)}</div>
              </div>
            )}
            {skillLines.length > 0 && (
              <div>
                <h4>Skills (LinkedIn)</h4>
                <div className="tags-cloud">{skillLines.map(s => <span key={s} className="tag">{s}</span>)}</div>
              </div>
            )}
          </div>
        )}

        {li.recentActivity && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Recent Activity</div>
            <div style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.55 }}>{li.recentActivity}</div>
          </div>
        )}
      </div>
    </div>
  );
}
