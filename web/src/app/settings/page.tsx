"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

type Position = { id: number; title: string; description: string };
type Preference = { id: number; tag: string; description: string; weight: number };

function useDebouncedSave(saveFn: () => Promise<void>, delay = 600) {
  const ref = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<null | "saving" | "saved">(null);
  const save = useCallback(() => {
    clearTimeout(ref.current);
    setState("saving");
    ref.current = setTimeout(async () => {
      await saveFn();
      setState("saved");
      setTimeout(() => setState(null), 1200);
    }, delay);
  }, [saveFn, delay]);
  return { save, state };
}

function SaveIndicator({ state }: { state: null | "saving" | "saved" }) {
  if (state === "saving") return <span className="saving">Saving…</span>;
  if (state === "saved") return <span className="saving ok">✓ Saved</span>;
  return null;
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [companyDesc, setCompanyDesc] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [loaded, setLoaded] = useState(false);
  const keyDebRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [keySaveStates, setKeySaveStates] = useState<Record<string, null | "saving" | "saved">>({});
  const companyDebRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [companySave, setCompanySave] = useState<null | "saving" | "saved">(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/settings/positions").then(r => r.json()),
      fetch("/api/settings/preferences").then(r => r.json()),
    ]).then(([settings, pos, prf]) => {
      setKeys({
        anthropic_api_key: settings.anthropic_api_key ?? "",
        firecrawl_api_key: settings.firecrawl_api_key ?? "",
        browserbase_api_key: settings.browserbase_api_key ?? "",
        browserbase_project_id: settings.browserbase_project_id ?? "",
      });
      setCompanyDesc(settings.company_description ?? "");
      setPositions(pos);
      setPrefs(prf);
      setLoaded(true);
    });
  }, []);

  const handleKey = (settingKey: string, v: string) => {
    setKeys(prev => ({ ...prev, [settingKey]: v }));
    clearTimeout(keyDebRefs.current[settingKey]);
    setKeySaveStates(prev => ({ ...prev, [settingKey]: "saving" }));
    keyDebRefs.current[settingKey] = setTimeout(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: v }),
      });
      setKeySaveStates(prev => ({ ...prev, [settingKey]: "saved" }));
      setTimeout(() => setKeySaveStates(prev => ({ ...prev, [settingKey]: null })), 1200);
    }, 600);
  };

  const handleCompanyDesc = (v: string) => {
    setCompanyDesc(v);
    clearTimeout(companyDebRef.current);
    setCompanySave("saving");
    companyDebRef.current = setTimeout(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "company_description", value: v }),
      });
      setCompanySave("saved");
      setTimeout(() => setCompanySave(null), 1200);
    }, 600);
  };

  const addPosition = async () => {
    const res = await fetch("/api/settings/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", description: "" }),
    });
    const pos = await res.json();
    setPositions(prev => [...prev, pos]);
  };

  const updatePosition = async (id: number, data: Partial<Position>) => {
    setPositions(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    await fetch("/api/settings/positions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
  };

  const deletePosition = async (id: number) => {
    setPositions(prev => prev.filter(p => p.id !== id));
    await fetch("/api/settings/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  const addPref = async () => {
    const res = await fetch("/api/settings/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "", description: "", weight: 1 }),
    });
    const pref = await res.json();
    setPrefs(prev => [...prev, pref]);
  };

  const updatePref = async (id: number, data: Partial<Preference>) => {
    setPrefs(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
    await fetch("/api/settings/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
  };

  const deletePref = async (id: number) => {
    setPrefs(prev => prev.filter(p => p.id !== id));
    await fetch("/api/settings/preferences", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  if (!loaded) return <div className="app-shell"><div style={{ padding: 40, color: "var(--color-fg-subtle)" }}>Loading...</div></div>;

  return (
    <div className="app-shell">
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 24px", borderBottom: "1px solid var(--color-border)" }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--color-fg-muted)", textDecoration: "none" }}>← Back</Link>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>Settings</h1>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 36 }}>
        <p style={{ fontSize: 13, color: "var(--color-fg-muted)", lineHeight: 1.6, margin: 0 }}>
          Configure your company context. This information is available to both the enrichment research agent and the analysis agent — it informs how candidates are evaluated, what signals to prioritize, and how fit scores are calculated.
        </p>

        {/* API Keys */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>API Keys</h2>
            <SaveIndicator state={Object.values(keySaveStates).find(s => s === "saving") ? "saving" : Object.values(keySaveStates).find(s => s === "saved") ? "saved" : null} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--color-fg-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Leave blank to use environment variables. Only the Anthropic key is required — Firecrawl and Browserbase enable additional tools.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", marginBottom: 2, display: "block" }}>Anthropic (required)</label>
              <input type="password" value={keys.anthropic_api_key ?? ""} onChange={e => handleKey("anthropic_api_key", e.target.value)}
                placeholder="sk-ant-..." style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", marginBottom: 2, display: "block" }}>Firecrawl (web search + scraping)</label>
              <input type="password" value={keys.firecrawl_api_key ?? ""} onChange={e => handleKey("firecrawl_api_key", e.target.value)}
                placeholder="fc-..." style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", marginBottom: 2, display: "block" }}>Browserbase API key (LinkedIn + Twitter)</label>
                <input type="password" value={keys.browserbase_api_key ?? ""} onChange={e => handleKey("browserbase_api_key", e.target.value)}
                  placeholder="bb-..." style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", marginBottom: 2, display: "block" }}>Browserbase project ID</label>
                <input value={keys.browserbase_project_id ?? ""} onChange={e => handleKey("browserbase_project_id", e.target.value)}
                  placeholder="Project ID" style={{ ...inputStyle, width: "100%" }} />
              </div>
            </div>
          </div>
        </section>

        {/* Company Description */}
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Company Description</h2>
            <SaveIndicator state={companySave} />
          </div>
          <textarea
            value={companyDesc}
            onChange={e => handleCompanyDesc(e.target.value)}
            placeholder="Describe your company — what it does, its mission, the team, the tech stack..."
            rows={4}
            style={textareaStyle}
          />
        </section>

        {/* Open Positions */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Open Positions <span style={{ color: "var(--color-fg-subtle)", fontWeight: 400 }}>{positions.length}</span></h2>
            <button onClick={addPosition} style={addBtnStyle}>+ Add Position</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {positions.map(p => (
              <PositionCard key={p.id} position={p} onUpdate={updatePosition} onDelete={deletePosition} />
            ))}
            {positions.length === 0 && (
              <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-fg-subtle)", fontSize: 13, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-DEFAULT)" }}>
                No positions yet. Add one to help the agent evaluate candidates against your open roles.
              </div>
            )}
          </div>
        </section>

        {/* Hiring Preferences */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Hiring Preferences <span style={{ color: "var(--color-fg-subtle)", fontWeight: 400 }}>{prefs.length}</span></h2>
            <button onClick={addPref} style={addBtnStyle}>+ Add Tag</button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--color-fg-muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Tags the agent uses to evaluate candidates. Higher weight = stronger signal. The agent will look for evidence of each tag during research and score accordingly.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {prefs.map(p => (
              <PreferenceRow key={p.id} pref={p} onUpdate={updatePref} onDelete={deletePref} />
            ))}
            {prefs.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--color-fg-subtle)", fontSize: 13, border: "1px dashed var(--color-border)", borderRadius: "var(--radius-DEFAULT)" }}>
                No preferences yet. Add tags like "legal-tech experience", "open source contributor", "AI/ML skills".
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PositionCard({ position, onUpdate, onDelete }: {
  position: Position;
  onUpdate: (id: number, data: Partial<Position>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const titleRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const descRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debounceUpdate = (field: keyof Position, value: string) => {
    const ref = field === "title" ? titleRef : descRef;
    clearTimeout(ref.current);
    ref.current = setTimeout(() => onUpdate(position.id, { [field]: value }), 500);
  };

  return (
    <div style={{
      border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)",
      background: "var(--color-panel)", padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input
          type="text"
          defaultValue={position.title}
          onChange={e => debounceUpdate("title", e.target.value)}
          placeholder="Position title — e.g. Senior Full-Stack Engineer"
          style={{ ...inputStyle, fontWeight: 600, flex: 1 }}
        />
        <button onClick={() => onDelete(position.id)} style={deleteBtnStyle} title="Remove position">×</button>
      </div>
      <textarea
        defaultValue={position.description}
        onChange={e => debounceUpdate("description", e.target.value)}
        placeholder="Requirements, tech stack, experience level, nice-to-haves..."
        rows={3}
        style={{ ...textareaStyle, fontSize: 12.5 }}
      />
    </div>
  );
}

function PreferenceRow({ pref, onUpdate, onDelete }: {
  pref: Preference;
  onUpdate: (id: number, data: Partial<Preference>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const tagRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const descRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const debounceUpdate = (field: string, value: string | number) => {
    const ref = field === "tag" ? tagRef : descRef;
    clearTimeout(ref.current);
    ref.current = setTimeout(() => onUpdate(pref.id, { [field]: value }), 500);
  };

  const weights = [
    { value: 1, label: "Low" },
    { value: 2, label: "Medium" },
    { value: 3, label: "High" },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      padding: "8px 10px", border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-DEFAULT)", background: "var(--color-panel)",
    }}>
      <div style={{
        display: "flex", gap: 2, flexShrink: 0, paddingTop: 6,
      }}>
        {weights.map(w => (
          <button
            key={w.value}
            onClick={() => { onUpdate(pref.id, { weight: w.value }); }}
            title={w.label + " priority"}
            style={{
              width: 8, height: 8, borderRadius: "50%", border: "none", cursor: "pointer", padding: 0,
              background: pref.weight >= w.value ? "#5e6ad2" : "var(--color-border)",
              transition: "background 0.1s",
            }}
          />
        ))}
      </div>
      <input
        type="text"
        defaultValue={pref.tag}
        onChange={e => debounceUpdate("tag", e.target.value)}
        placeholder="Tag — e.g. legal-tech experience"
        style={{ ...inputStyle, fontWeight: 600, width: 180, flexShrink: 0 }}
      />
      <input
        type="text"
        defaultValue={pref.description}
        onChange={e => debounceUpdate("description", e.target.value)}
        placeholder="What to look for — e.g. has worked at a law firm, legal SaaS, or compliance startup"
        style={{ ...inputStyle, flex: 1, color: "var(--color-fg-muted)" }}
      />
      <button onClick={() => onDelete(pref.id)} style={deleteBtnStyle} title="Remove tag">×</button>
    </div>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6,
  padding: "10px 12px", border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-DEFAULT)", background: "var(--color-bg-2)",
  color: "var(--color-fg)", resize: "vertical",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "inherit", fontSize: 13, padding: "5px 8px",
  border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
  background: "var(--color-bg-2)", color: "var(--color-fg)",
};

const addBtnStyle: React.CSSProperties = {
  appearance: "none", border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-accent)",
  borderRadius: "var(--radius-DEFAULT)", padding: "4px 12px",
  fontSize: 12, fontWeight: 500, cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  appearance: "none", border: "none", background: "transparent",
  color: "var(--color-fg-subtle)", fontSize: 18, cursor: "pointer",
  padding: "0 4px", lineHeight: 1,
};
