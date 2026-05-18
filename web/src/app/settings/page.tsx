"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const FIELDS = [
  {
    key: "company_description",
    label: "Company Description",
    placeholder: "Describe your company — what it does, its mission, the team, the tech stack. This context helps the research agent understand what you're looking for.\n\nExample: \"We're building an AI-powered legal research platform. Our stack is TypeScript, Next.js, Python, and we use Claude for document analysis. We're a 12-person team in NYC, Series A.\"",
    rows: 6,
  },
  {
    key: "job_descriptions",
    label: "Open Positions",
    placeholder: "Paste job descriptions for roles you're hiring for. The agent will evaluate candidates against these specific positions.\n\nExample:\n\nSenior Full-Stack Engineer\n- 5+ years TypeScript/React experience\n- Experience with AI/ML APIs\n- Legal tech or compliance experience a plus\n\nML Engineer\n- PyTorch/TensorFlow, NLP experience\n- RAG pipeline development\n- Production ML systems",
    rows: 12,
  },
  {
    key: "hiring_preferences",
    label: "Hiring Preferences",
    placeholder: "What matters most to you? What should the agent prioritize when evaluating candidates?\n\nExample: \"We prefer candidates who are actively building — original repos, published packages, blog posts. Open source contributions matter more than follower count. Legal tech experience is a strong plus but not required if they have strong AI/ML skills. We're open to remote but prefer US/EU time zones.\"",
    rows: 6,
  },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | null>>({});
  const [loaded, setLoaded] = useState(false);
  const debRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setValues(data);
        setLoaded(true);
      });
  }, []);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaving((prev) => ({ ...prev, [key]: "saving" }));

    clearTimeout(debRefs.current[key]);
    debRefs.current[key] = setTimeout(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      setSaving((prev) => ({ ...prev, [key]: "saved" }));
      setTimeout(() => setSaving((prev) => ({ ...prev, [key]: null })), 1400);
    }, 600);
  };

  return (
    <div className="app-shell">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 24px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: "var(--color-fg-muted)",
            textDecoration: "none",
          }}
        >
          ← Back
        </Link>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>Settings</h1>
      </header>

      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <p
          style={{
            fontSize: 13,
            color: "var(--color-fg-muted)",
            lineHeight: 1.6,
          }}
        >
          Configure your company context. This information is available to both
          the enrichment research agent and the analysis agent — it informs how
          candidates are evaluated, what signals to prioritize, and how fit
          scores are calculated.
        </p>

        {!loaded ? (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13 }}>
            Loading...
          </div>
        ) : (
          FIELDS.map((field) => (
            <div key={field.key} className="field">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {field.label}
                {saving[field.key] === "saving" && (
                  <span className="saving">Saving…</span>
                )}
                {saving[field.key] === "saved" && (
                  <span className="saving ok">✓ Saved</span>
                )}
              </label>
              <textarea
                value={values[field.key] ?? ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={field.rows}
                style={{
                  width: "100%",
                  fontFamily: "inherit",
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: "10px 12px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-DEFAULT)",
                  background: "var(--color-bg-2)",
                  color: "var(--color-fg)",
                  resize: "vertical",
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
