"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Phase = "setup" | "seeding" | "hydrating" | "done" | "error";
type DraftPosition = { title: string; description: string };
type DraftPref = { tag: string; description: string; weight: number };

const PIPELINE_STEPS = [
  { key: "seeding", label: "Discovering candidates" },
  { key: "hydrating", label: "Fetching profiles" },
  { key: "done", label: "Ready" },
] as const;

function SetupForm({ onComplete }: { onComplete: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [company, setCompany] = useState("");
  const [positions, setPositions] = useState<DraftPosition[]>([{ title: "", description: "" }]);
  const [prefs, setPrefs] = useState<DraftPref[]>([{ tag: "", description: "", weight: 2 }]);
  const [saving, setSaving] = useState(false);

  const addPosition = () => setPositions((p) => [...p, { title: "", description: "" }]);
  const removePosition = (i: number) => setPositions((p) => p.filter((_, j) => j !== i));
  const updatePosition = (i: number, field: keyof DraftPosition, value: string) =>
    setPositions((p) => p.map((pos, j) => (j === i ? { ...pos, [field]: value } : pos)));

  const addPref = () => setPrefs((p) => [...p, { tag: "", description: "", weight: 2 }]);
  const removePref = (i: number) => setPrefs((p) => p.filter((_, j) => j !== i));
  const updatePref = (i: number, field: string, value: string | number) =>
    setPrefs((p) => p.map((pr, j) => (j === i ? { ...pr, [field]: value } : pr)));

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      const headers = { "Content-Type": "application/json" };

      if (apiKey.trim()) {
        await fetch("/api/settings", {
          method: "PUT", headers,
          body: JSON.stringify({ key: "anthropic_api_key", value: apiKey.trim() }),
        });
      }

      if (company.trim()) {
        await fetch("/api/settings", {
          method: "PUT", headers,
          body: JSON.stringify({ key: "company_description", value: company.trim() }),
        });
      }

      for (const pos of positions) {
        if (!pos.title.trim()) continue;
        await fetch("/api/settings/positions", {
          method: "POST", headers,
          body: JSON.stringify({ title: pos.title.trim(), description: pos.description.trim() }),
        });
      }

      for (const pref of prefs) {
        if (!pref.tag.trim()) continue;
        await fetch("/api/settings/preferences", {
          method: "POST", headers,
          body: JSON.stringify({ tag: pref.tag.trim(), description: pref.description.trim(), weight: pref.weight }),
        });
      }

      onComplete();
    } catch {
      setSaving(false);
    }
  }, [company, positions, prefs, onComplete]);

  return (
    <div className="onboarding-setup">
      <div className="setup-section">
        <label className="setup-label">Anthropic API key</label>
        <input
          className="setup-input"
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <span className="setup-hint">Required for enrichment. Leave blank if set via environment variable.</span>
      </div>

      <div className="setup-section">
        <label className="setup-label">Tell Donna about your company</label>
        <textarea
          className="setup-textarea"
          placeholder="e.g. We're a legal tech startup building AI-powered contract analysis tools. Our stack is TypeScript, Python, and React..."
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          rows={3}
        />
      </div>

      <div className="setup-section">
        <div className="setup-section-header">
          <label className="setup-label">Open positions</label>
          <button className="setup-add" onClick={addPosition}>+ Add</button>
        </div>
        {positions.map((pos, i) => (
          <div key={i} className="setup-card">
            <div className="setup-card-header">
              <input
                className="setup-input"
                style={{ fontWeight: 600, flex: 1 }}
                placeholder="Position title — e.g. Senior Full-Stack Engineer"
                value={pos.title}
                onChange={(e) => updatePosition(i, "title", e.target.value)}
              />
              {positions.length > 1 && (
                <button className="setup-remove" onClick={() => removePosition(i)}>x</button>
              )}
            </div>
            <textarea
              className="setup-textarea"
              placeholder="Requirements, tech stack, experience level, nice-to-haves..."
              value={pos.description}
              onChange={(e) => updatePosition(i, "description", e.target.value)}
              rows={2}
            />
          </div>
        ))}
      </div>

      <div className="setup-section">
        <div className="setup-section-header">
          <label className="setup-label">Hiring preferences</label>
          <button className="setup-add" onClick={addPref}>+ Add</button>
        </div>
        <span className="setup-hint">What matters when evaluating candidates. Click dots to set priority.</span>
        {prefs.map((pref, i) => (
          <div key={i} className="setup-pref-row">
            <div className="setup-weight-dots">
              {[1, 2, 3].map((w) => (
                <button
                  key={w}
                  className="setup-dot"
                  data-active={pref.weight >= w || undefined}
                  onClick={() => updatePref(i, "weight", w)}
                  title={["Low", "Medium", "High"][w - 1] + " priority"}
                />
              ))}
            </div>
            <input
              className="setup-input"
              style={{ fontWeight: 600, width: 160, flexShrink: 0 }}
              placeholder="e.g. AI experience"
              value={pref.tag}
              onChange={(e) => updatePref(i, "tag", e.target.value)}
            />
            <input
              className="setup-input"
              style={{ flex: 1, color: "var(--color-fg-muted)" }}
              placeholder="What to look for..."
              value={pref.description}
              onChange={(e) => updatePref(i, "description", e.target.value)}
            />
            {prefs.length > 1 && (
              <button className="setup-remove" onClick={() => removePref(i)}>x</button>
            )}
          </div>
        ))}
      </div>

      <div className="setup-actions">
        <button className="setup-start" onClick={submit} disabled={saving}>
          {saving ? "Saving..." : "Get started"}
        </button>
        <button className="setup-skip" onClick={onComplete} disabled={saving}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

export function SeedingState() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("setup");
  const [seedResult, setSeedResult] = useState<{ ingested: number; total: number } | null>(null);

  const startPipeline = useCallback(() => {
    setPhase("seeding");
  }, []);

  useEffect(() => {
    if (phase !== "seeding") return;
    let cancelled = false;

    (async () => {
      try {
        const seedRes = await fetch("/api/seed", { method: "POST" });
        const seedData = await seedRes.json();
        if (cancelled) return;
        setSeedResult(seedData);

        setPhase("hydrating");
        await fetch("/api/seed/hydrate", { method: "POST" });
        if (cancelled) return;

        setPhase("done");
        setTimeout(() => router.refresh(), 800);
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();

    return () => { cancelled = true; };
  }, [phase, router]);

  const stepIdx = PIPELINE_STEPS.findIndex((s) => s.key === phase);

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-logo">
          <div className="logo-mark" style={{ width: 64, height: 64, fontSize: 36, borderRadius: 16 }}>D</div>
        </div>
        <h1 className="onboarding-title">Donna</h1>
        <p className="onboarding-tagline">Find your Mike</p>

        {phase === "setup" && (
          <SetupForm onComplete={startPipeline} />
        )}

        {phase !== "setup" && (
          <>
            <div className="onboarding-steps">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone = stepIdx > i || phase === "done";
                const isActive = stepIdx === i && phase !== "done" && phase !== "error";
                return (
                  <div key={step.key} className="onboarding-step" data-done={isDone || undefined} data-active={isActive || undefined}>
                    <div className="step-indicator">
                      {isDone ? "✓" : isActive ? <span className="seed-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <span className="step-dot" />}
                    </div>
                    <span className="step-label">{step.label}</span>
                    {step.key === "seeding" && isActive && (
                      <span className="step-detail">forkers, stargazers, contributors, issue &amp; PR authors</span>
                    )}
                    {step.key === "seeding" && isDone && seedResult && (
                      <span className="step-detail">{seedResult.total.toLocaleString()} found</span>
                    )}
                    {step.key === "hydrating" && isActive && (
                      <span className="step-detail">follower counts, repos, commits, bios, locations</span>
                    )}
                    {step.key === "hydrating" && isDone && (
                      <span className="step-detail">profiles loaded</span>
                    )}
                  </div>
                );
              })}
            </div>

            {phase === "error" && (
              <div className="onboarding-error">
                <p>Something went wrong. Make sure <code>gh</code> is authenticated and Docker is running.</p>
                <button className="onboarding-retry" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </div>
            )}

            {phase !== "error" && (
              <p className="onboarding-quote">&ldquo;I know everything.&rdquo;</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
