"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [chunks, setChunks] = useState<string[]>([]);
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
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        const response = await fetch(`/api/enrich/${login}`, {
          method: "POST",
          signal: controller.signal,
        });

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
            if (!line.trim()) continue;

            // AI SDK text stream protocol:
            // 0: = text delta (JSON-encoded string)
            // 9: = tool call
            // e: = finish
            // d: = done
            if (line.startsWith("0:")) {
              try {
                const text = JSON.parse(line.slice(2));
                if (text) setChunks(prev => [...prev, text]);
              } catch {}
            } else if (line.startsWith("9:")) {
              try {
                const data = JSON.parse(line.slice(2));
                if (data?.toolName) {
                  setToolCalls(prev => [...prev, {
                    name: data.toolName,
                    args: JSON.stringify(data.args || {}).slice(0, 100),
                  }]);
                }
              } catch {}
            } else if (line.startsWith("e:")) {
              setStatus("done");
            } else if (line.startsWith("d:")) {
              setStatus("done");
            }
          }
        }

        setStatus("done");
      } catch (e: any) {
        if (e.name !== "AbortError") {
          setChunks(prev => [...prev, `\n\n**Error:** ${e.message}`]);
        }
        setStatus("done");
      }

      setTimeout(() => {
        router.refresh();
        onDone();
      }, 2000);
    };

    run();
    return () => controller.abort();
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks, toolCalls]);

  const abort = () => {
    abortRef.current?.abort();
    setStatus("done");
    setChunks(prev => [...prev, "\n\n*Aborted by user.*"]);
  };

  const fullText = chunks.join("");

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

      {/* Content: agent reasoning as markdown + tool calls inline */}
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
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.args}</span>
              </div>
            ))}
          </div>
        )}

        {/* Agent reasoning as markdown */}
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
