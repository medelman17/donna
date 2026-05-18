"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Phase = "setup" | "seeding" | "hydrating" | "done" | "error";

const PIPELINE_STEPS = [
  { key: "seeding", label: "Discovering candidates" },
  { key: "hydrating", label: "Fetching profiles" },
  { key: "done", label: "Ready" },
] as const;

function SetupForm({ onComplete }: { onComplete: () => void }) {
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [prefs, setPrefs] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      if (company.trim()) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "company_description", value: company.trim() }),
        });
      }
      if (roleTitle.trim()) {
        await fetch("/api/settings/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: roleTitle.trim(), description: roleDesc.trim() }),
        });
      }
      if (prefs.trim()) {
        const tags = prefs.split(",").map((t) => t.trim()).filter(Boolean);
        for (const tag of tags) {
          await fetch("/api/settings/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag, description: "", weight: 2 }),
          });
        }
      }
      onComplete();
    } catch {
      setSaving(false);
    }
  }, [company, roleTitle, roleDesc, prefs, onComplete]);

  return (
    <div className="onboarding-setup">
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
        <label className="setup-label">What role are you hiring for?</label>
        <input
          className="setup-input"
          placeholder="e.g. Senior Full-Stack Engineer"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
        />
        <textarea
          className="setup-textarea"
          placeholder="Describe the role — what they'd work on, what skills matter..."
          value={roleDesc}
          onChange={(e) => setRoleDesc(e.target.value)}
          rows={2}
        />
      </div>

      <div className="setup-section">
        <label className="setup-label">What are you looking for?</label>
        <input
          className="setup-input"
          placeholder="e.g. AI experience, legal background, open source contributor"
          value={prefs}
          onChange={(e) => setPrefs(e.target.value)}
        />
        <span className="setup-hint">Comma-separated traits that matter to you</span>
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
          <div className="logo-mark" style={{ width: 36, height: 36, fontSize: 20, borderRadius: 10 }}>D</div>
        </div>
        <h1 className="onboarding-title">Donna</h1>
        <p className="onboarding-tagline">Agentic legal tech talent discovery</p>

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
