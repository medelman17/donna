// app.jsx — root: view routing + tweaks + CRM mutation state
/* global React, ReactDOM, ListView, DetailView, CANDIDATES,
   useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakToggle */

const { useState, useMemo, useCallback } = React;

const TS_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "variant": "linear",
  "fitScore": "chip",
  "density": "ultra",
  "avatar": "rounded",
  "sidebar": "right",
  "hideLinkedin": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TS_TWEAK_DEFAULTS);
  const [view, setView] = useState({ kind: "list" });
  // Mutable CRM state lives outside the candidate objects so the list reflects
  // updates the user makes in the detail page.
  const [crmOverrides, setCrmOverrides] = useState({}); // { login: { status, notes, tags } }

  // Apply overrides on top of base data
  const candidates = useMemo(() => {
    return CANDIDATES.map(c => {
      const o = crmOverrides[c.login];
      if (!o) return c;
      return { ...c, crm: { ...c.crm, ...o } };
    });
  }, [crmOverrides]);

  // Apply theme variant to body
  React.useEffect(() => {
    document.body.dataset.variant = t.variant;
  }, [t.variant]);

  const open = useCallback((login) => setView({ kind: "detail", login }), []);
  const back = useCallback(() => setView({ kind: "list" }), []);

  const currentIdx = view.kind === "detail"
    ? candidates.findIndex(c => c.login === view.login) : -1;
  const prev = useCallback(() => {
    if (currentIdx <= 0) return;
    setView({ kind: "detail", login: candidates[currentIdx - 1].login });
  }, [candidates, currentIdx]);
  const next = useCallback(() => {
    if (currentIdx < 0 || currentIdx >= candidates.length - 1) return;
    setView({ kind: "detail", login: candidates[currentIdx + 1].login });
  }, [candidates, currentIdx]);

  const updateCrm = useCallback((patch) => {
    if (view.kind !== "detail") return;
    setCrmOverrides(o => ({
      ...o,
      [view.login]: { ...candidates.find(c => c.login === view.login).crm, ...o[view.login], ...patch },
    }));
  }, [view, candidates]);

  const currentCandidate = view.kind === "detail" ? candidates[currentIdx] : null;

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div className="logo">
          <div className="logo-mark">T</div>
          <span>Talent Scout</span>
        </div>
        <span className="crumb">
          /
          <a href="#" onClick={(e) => { e.preventDefault(); back(); }}> willchen96/mike</a>
          {view.kind === "detail" && currentCandidate && (
            <> / <span style={{ color: "var(--fg-muted)" }}>@{currentCandidate.login}</span></>
          )}
        </span>
        <div className="spacer"></div>
        <div className="meta">
          <span className="pill"><span className="dot"></span>Pipeline ran 2h ago</span>
          <span>912 forkers · 904 enriched · 901 analyzed</span>
        </div>
      </div>

      {/* Main */}
      {view.kind === "list" && (
        <ListView candidates={candidates} onOpen={open} tweaks={t} />
      )}
      {view.kind === "detail" && currentCandidate && (
        <DetailView
          candidate={currentCandidate}
          onBack={back}
          onPrev={prev}
          onNext={next}
          onUpdate={updateCrm}
          tweaks={t}
          prevName={candidates[currentIdx - 1]?.name || "—"}
          nextName={candidates[currentIdx + 1]?.name || "—"}
        />
      )}

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Visual style" />
        <TweakSelect
          label="Theme"
          value={t.variant}
          options={[
            { value: "linear", label: "Linear (cool grays, indigo)" },
            { value: "github", label: "GitHub (warmer, blue accents)" },
            { value: "notion", label: "Notion (warm neutrals, orange)" },
          ]}
          onChange={v => setTweak("variant", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["ultra", "comfy", "roomy"]}
          onChange={v => setTweak("density", v)}
        />
        <TweakRadio
          label="Avatar"
          value={t.avatar}
          options={["square", "rounded", "circle"]}
          onChange={v => setTweak("avatar", v)}
        />

        <TweakSection label="Fit score" />
        <TweakSelect
          label="Treatment"
          value={t.fitScore}
          options={[
            { value: "chip", label: "Numeric chip (5/5)" },
            { value: "dots", label: "Dots ●●●●○" },
            { value: "bar",  label: "Bar / meter" },
            { value: "grade", label: "Letter grade (A+/A/B…)" },
          ]}
          onChange={v => setTweak("fitScore", v)}
        />

        <TweakSection label="Detail page" />
        <TweakRadio
          label="CRM sidebar"
          value={t.sidebar}
          options={["left", "right"]}
          onChange={v => setTweak("sidebar", v)}
        />
        <TweakToggle
          label="Hide LinkedIn block"
          value={t.hideLinkedin}
          onChange={v => setTweak("hideLinkedin", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
