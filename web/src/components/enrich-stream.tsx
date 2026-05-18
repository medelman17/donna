"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; args: string }
  | { type: "tool-result"; toolName: string; result: string }
  | { type: "done" };

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [textChunks, setTextChunks] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<{ name: string; args: string }[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        const response = await fetch(`/api/enrich/${login}`, {
          method: "POST",
          signal: controller.signal,
        });

        if (cancelled) return;
        setStatus("streaming");

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const event: StreamEvent = JSON.parse(trimmed.slice(6));

              switch (event.type) {
                case "text":
                  setTextChunks(prev => [...prev, event.text]);
                  break;
                case "tool-call":
                  setToolCalls(prev => [...prev, { name: event.toolName, args: event.args }]);
                  break;
                case "tool-result":
                  // Tool results handled silently — the text stream has the reasoning
                  break;
                case "done":
                  setStatus("done");
                  setTimeout(() => {
                    router.refresh();
                    onDone();
                  }, 2000);
                  break;
              }
            } catch {}
          }
        }

        if (status !== "done") setStatus("done");
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setTextChunks(prev => [...prev, `\n\n**Error:** ${e.message}`]);
        }
        setStatus("done");
      }
    };

    run();
    return () => { cancelled = true; };
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [textChunks, toolCalls]);

  const abort = () => {
    abortRef.current?.abort();
    setStatus("done");
    setTextChunks(prev => [...prev, "\n\n*Aborted by user.*"]);
  };

  const fullText = textChunks.join("");

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
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toolCalls.length} tools</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>

        {status === "streaming" && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>● Live</span>
            <button
              onClick={abort}
              style={{
                appearance: "none", border: "1px solid color-mix(in oklab, #dc2626, transparent 60%)",
                background: "color-mix(in oklab, #dc2626, transparent 94%)", color: "#dc2626",
                borderRadius: "var(--radius-DEFAULT)", padding: "2px 8px",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
              }}
            >
              ■ Stop
            </button>
          </span>
        )}
        {status === "done" && (
          <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 500 }}>✓ Complete</span>
        )}
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
        {/* Tool call log */}
        {toolCalls.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {toolCalls.map((tc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "3px 14px", fontSize: 11.5,
                fontFamily: "var(--font-geist-mono)", color: "var(--color-fg-muted)",
              }}>
                <span style={{ color: "#16a34a" }}>✓</span>
                <span style={{ fontWeight: 500 }}>{tc.name}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{tc.args}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent reasoning as streaming markdown */}
        {fullText && (
          <div style={{
            border: "1px solid var(--color-border)", borderRadius: "var(--radius-DEFAULT)",
            padding: "14px 18px", fontSize: 13, lineHeight: 1.55,
          }}>
            <Markdown remarkPlugins={[remarkGfm]}>{fullText}</Markdown>
          </div>
        )}

        {status === "connecting" && (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: 20, textAlign: "center" }}>
            Starting enrichment agent...
          </div>
        )}
      </div>
    </div>
  );
}
