"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type EnrichEvent =
  | { type: "reasoning"; step: number; text: string }
  | { type: "tool_call"; tool: string; detail: string; durationMs: number; ok: boolean }
  | { type: "persist"; what: string }
  | { type: "subagent_start"; name: string; description: string }
  | { type: "subagent_reasoning"; name: string; text: string }
  | { type: "subagent_end"; name: string; duration_ms: number }
  | { type: "summary"; text: string }
  | { type: "done"; tool_calls: number; steps: number; duration_ms: number }
  | { type: "error"; message: string };

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [events, setEvents] = useState<EnrichEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [persisted, setPersisted] = useState<string[]>([]);
  const [toolCount, setToolCount] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trigger = async () => {
      await fetch(`/api/enrich/${login}`, { method: "POST" });
    };
    trigger();

    const evtSource = new EventSource(`/api/enrich/${login}/stream`);
    setStatus("streaming");

    evtSource.onmessage = (e) => {
      const event: EnrichEvent = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);

      if (event.type === "tool_call") setToolCount(c => c + 1);
      if (event.type === "reasoning") setStepCount(event.step);
      if (event.type === "persist") setPersisted(p => p.includes(event.what) ? p : [...p, event.what]);

      if (event.type === "done") {
        setStatus("done");
        evtSource.close();
        setTimeout(() => {
          router.refresh();
          onDone();
        }, 3000);
      }
    };

    evtSource.onerror = () => {
      if (status !== "done") {
        setStatus("done");
        evtSource.close();
      }
    };

    return () => evtSource.close();
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="dx" style={{ padding: "16px 28px" }}>
      {/* Status bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
        background: "var(--color-bg-2)", border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-DEFAULT)", marginBottom: 16, fontSize: 12,
      }}>
        <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>{login}</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toolCount} tools</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{stepCount} steps</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>
        {persisted.length > 0 && (
          <>
            <span style={{ color: "var(--color-fg-muted)" }}>·</span>
            <span>Saved: {persisted.map(p => (
              <span key={p} style={{
                background: "#d8efde", color: "#1f7a3e", fontSize: 10.5,
                padding: "1px 6px", borderRadius: 999, marginLeft: 4, fontWeight: 500,
              }}>✓ {p}</span>
            ))}</span>
          </>
        )}
        {status === "streaming" && (
          <span style={{ marginLeft: "auto", color: "var(--color-accent)", fontWeight: 500 }}>
            ● Live
          </span>
        )}
        {status === "done" && (
          <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 500 }}>
            ✓ Complete
          </span>
        )}
      </div>

      {/* Event feed */}
      <div ref={scrollRef} style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
        {status === "connecting" && (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: 20, textAlign: "center" }}>
            Connecting to enrichment agent...
          </div>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: EnrichEvent }) {
  switch (event.type) {
    case "reasoning":
      return (
        <div style={{
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)",
          padding: "10px 14px", marginBottom: 8,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--color-accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Step {event.step}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-fg)" }}>
            <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
          </div>
        </div>
      );

    case "tool_call":
      return (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "3px 14px", fontSize: 11.5,
          fontFamily: "var(--font-geist-mono)", color: "var(--color-fg-muted)",
        }}>
          <span style={{ color: event.ok ? "#16a34a" : "#dc2626" }}>{event.ok ? "✓" : "✗"}</span>
          <span style={{ fontWeight: 500 }}>{event.tool}</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.detail}</span>
          {event.durationMs > 0 && <span style={{ color: "var(--color-fg-subtle)" }}>({event.durationMs}ms)</span>}
        </div>
      );

    case "subagent_start":
      return (
        <div style={{
          borderTop: "1px dashed var(--color-border-strong)", marginTop: 12, paddingTop: 10, marginBottom: 4,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)" }}>
            {event.name === "Technical Assessor" ? "🔍" : "⚖️"} {event.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--color-fg-subtle)", marginLeft: 8 }}>{event.description}</span>
        </div>
      );

    case "subagent_reasoning":
      return (
        <div style={{
          borderLeft: `3px solid ${event.name === "Technical Assessor" ? "#2563eb" : "#8b5cf6"}`,
          padding: "8px 14px", marginBottom: 6, marginLeft: 8,
          fontSize: 12.5, lineHeight: 1.5, color: "var(--color-fg)",
        }}>
          <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
        </div>
      );

    case "subagent_end":
      return (
        <div style={{
          fontSize: 11, color: "var(--color-fg-subtle)", padding: "2px 14px", marginBottom: 12, marginLeft: 8,
        }}>
          {event.name} completed in {(event.duration_ms / 1000).toFixed(1)}s
        </div>
      );

    case "summary":
      return (
        <div style={{
          border: "1px solid color-mix(in oklab, #16a34a, transparent 70%)",
          background: "color-mix(in oklab, #16a34a, transparent 95%)",
          borderRadius: "var(--radius-lg)", padding: "14px 18px", marginTop: 16, marginBottom: 8,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Summary
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--color-fg)" }}>
            <Markdown remarkPlugins={[remarkGfm]}>{event.text}</Markdown>
          </div>
        </div>
      );

    case "done":
      return (
        <div style={{
          textAlign: "center", padding: 16, fontSize: 12, color: "#16a34a", fontWeight: 500,
        }}>
          ✓ Enrichment complete — {event.tool_calls} tool calls, {event.steps} steps, {(event.duration_ms / 1000).toFixed(1)}s
        </div>
      );

    case "error":
      return (
        <div style={{
          background: "color-mix(in oklab, #dc2626, transparent 96%)",
          border: "1px solid color-mix(in oklab, #dc2626, transparent 70%)",
          borderRadius: "var(--radius-DEFAULT)", padding: "8px 14px", marginBottom: 8,
          color: "#dc2626", fontSize: 12.5,
        }}>
          Error: {event.message}
        </div>
      );

    default:
      return null;
  }
}
