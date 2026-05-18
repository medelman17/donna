"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type EnrichmentRun = {
  startedAt: string;
  tools: { tool: string; createdAt: string }[];
  narrative: string | null;
};

export function EnrichmentHistory({ runs }: { runs: EnrichmentRun[] }) {
  const [expanded, setExpanded] = useState<number | null>(runs.length > 0 ? 0 : null);

  if (runs.length === 0) {
    return (
      <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: "20px 0" }}>
        No enrichment runs yet. Click "Enrich with agent" to start.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {runs.map((run, i) => {
        const date = new Date(run.startedAt);
        const isOpen = expanded === i;
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-DEFAULT)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setExpanded(isOpen ? null : i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "10px 14px",
                background: isOpen ? "var(--color-bg-2)" : "var(--color-panel)",
                border: "none",
                borderBottom: isOpen ? "1px solid var(--color-border)" : "none",
                cursor: "pointer",
                fontSize: 12.5,
                fontFamily: "inherit",
                color: "var(--color-fg)",
                textAlign: "left",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" "}
                {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
              <span style={{ color: "var(--color-fg-muted)", fontSize: 11.5 }}>
                {run.tools.length} tool calls
              </span>
              {run.narrative && (
                <span
                  style={{
                    marginLeft: "auto",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 500,
                    background: "#dff5e6",
                    color: "#1f7a3e",
                  }}
                >
                  has narrative
                </span>
              )}
              <span
                style={{
                  marginLeft: run.narrative ? 0 : "auto",
                  color: "var(--color-fg-subtle)",
                  fontSize: 11,
                  transition: "transform 0.15s",
                  transform: isOpen ? "rotate(90deg)" : "none",
                }}
              >
                ▸
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: "12px 14px" }}>
                {/* Tool call log */}
                <div style={{ marginBottom: run.narrative ? 14 : 0 }}>
                  {run.tools.map((tc, j) => (
                    <div
                      key={j}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "2px 0",
                        fontSize: 11.5,
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        color: "var(--color-fg-muted)",
                      }}
                    >
                      <span style={{ color: "#16a34a", fontWeight: 600 }}>✓</span>
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: "var(--color-bg-2)",
                          fontSize: 10.5,
                          fontWeight: 500,
                        }}
                      >
                        {tc.tool}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--color-fg-subtle)" }}>
                        {new Date(tc.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Narrative */}
                {run.narrative && (
                  <div
                    style={{
                      borderTop: "1px solid var(--color-border)",
                      paddingTop: 12,
                    }}
                  >
                    <div className="enrich-prose">
                      <Markdown remarkPlugins={[remarkGfm]}>{run.narrative}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
