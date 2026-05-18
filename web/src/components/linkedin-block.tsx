type LinkedInData = {
  headline: string | null; connectionCount: number | null;
  experience: string | null; education: string | null; skills: string | null;
};

export function LinkedInBlock({ li }: { li: LinkedInData }) {
  const experience: any[] = li.experience ? JSON.parse(li.experience) : [];
  const education: any[] = li.education ? JSON.parse(li.education) : [];
  const skills: string[] = li.skills ? JSON.parse(li.skills) : [];

  return (
    <div className="li-block">
      <div className="li-head">
        <div className="li-mark">in</div>
        <div className="li-headline">{li.headline}</div>
        {li.connectionCount != null && <div className="li-conn">{li.connectionCount} connections</div>}
      </div>
      <div className="li-body">
        {experience.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Experience</div>
            <div className="timeline">
              {experience.map((r: any, i: number) => (
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
        {(education.length > 0 || skills.length > 0) && (
          <div className="li-sub">
            {education.length > 0 && (
              <div>
                <h4>Education</h4>
                {education.map((e: any, i: number) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="school">{e.school}</div>
                    {e.degree && <div className="deg">{e.degree} {e.field || ""}</div>}
                    {e.years && <div className="yrs">{e.years}</div>}
                  </div>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <h4>Skills (LinkedIn)</h4>
                <div className="tags-cloud">{skills.map((s: string) => <span key={s} className="tag">{s}</span>)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
