"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enrichComponents } from "@/lib/enrich-components";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "card"; card: string; props: Record<string, unknown> }
  | { type: "tool"; tool: string; status: "running" | "done" };

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [elapsed, setElapsed] = useState(0);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(Date.now());
  const blocksRef = useRef<ContentBlock[]>([]);
  const lastTextRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      if (status === "streaming" && Date.now() - lastTextRef.current > 2000) {
        setThinking(true);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    let rafId = 0;

    const pushBlock = (block: ContentBlock) => {
      const last = blocksRef.current[blocksRef.current.length - 1];
      if (block.type === "text" && last?.type === "text") {
        last.text += block.text;
        blocksRef.current = [...blocksRef.current];
      } else {
        blocksRef.current = [...blocksRef.current, block];
      }
    };

    const flush = () => setBlocks([...blocksRef.current]);
    const scheduleFlush = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(flush);
    };

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

            let evt: any;
            try { evt = JSON.parse(trimmed.slice(6)); } catch { continue; }

            switch (evt.event) {
              case "text":
                lastTextRef.current = Date.now();
                setThinking(false);
                pushBlock({ type: "text", text: evt.text });
                scheduleFlush();
                break;

              case "sep":
                pushBlock({ type: "text", text: "\n\n" });
                flush();
                break;

              case "tool-start":
                pushBlock({ type: "tool", tool: evt.tool, status: "running" });
                flush();
                setThinking(true);
                lastTextRef.current = Date.now();
                break;

              case "tool-end": {
                const idx = blocksRef.current.findLastIndex(
                  (b) => b.type === "tool" && b.tool === evt.tool && b.status === "running"
                );
                if (idx >= 0) {
                  (blocksRef.current[idx] as any).status = "done";
                  blocksRef.current = [...blocksRef.current];
                }
                setThinking(false);
                flush();
                break;
              }

              case "card":
                pushBlock({ type: "card", card: evt.card, props: evt.props });
                flush();
                break;

              case "done":
                flush();
                setStatus("done");
                setTimeout(() => {
                  router.refresh();
                  onDone();
                }, 2500);
                break;
            }
          }
        }

        cancelAnimationFrame(rafId);
        flush();
        if (status !== "done") setStatus("done");
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("[enrich-stream] error:", e);
        }
        setThinking(false);
        setStatus("done");
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
      cancelAnimationFrame(rafId);
    };
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks, thinking]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStatus("done");
    setThinking(false);
  }, []);

  const toolCount = blocks.filter((b) => b.type === "tool").length;
  const cardCount = blocks.filter((b) => b.type === "card").length;

  return (
    <div className="dx" style={{ padding: "16px 28px" }}>
      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          background: "var(--color-bg-2)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-DEFAULT)",
          marginBottom: 16,
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>{login}</span>
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{toolCount} tools</span>
        {cardCount > 0 && (
          <>
            <span style={{ color: "var(--color-fg-muted)" }}>·</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{cardCount} cards</span>
          </>
        )}
        <span style={{ color: "var(--color-fg-muted)" }}>·</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{elapsed}s</span>

        {status === "streaming" && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>● Live</span>
            <button
              onClick={abort}
              style={{
                appearance: "none",
                border: "1px solid color-mix(in oklab, #dc2626, transparent 60%)",
                background: "color-mix(in oklab, #dc2626, transparent 94%)",
                color: "#dc2626",
                borderRadius: "var(--radius-DEFAULT)",
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
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
        {blocks.length === 0 && status === "connecting" && (
          <div style={{ color: "var(--color-fg-subtle)", fontSize: 13, padding: 20, textAlign: "center" }}>
            Starting enrichment agent...
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
          {blocks.map((block, i) => {
            if (block.type === "text") {
              const text = block.text.trim();
              if (!text) return null;
              return (
                <div key={i} className="enrich-prose">
                  <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
                </div>
              );
            }
            if (block.type === "card") {
              const Component = enrichComponents[block.card];
              if (!Component) return null;
              return <Component key={i} props={block.props as any} />;
            }
            if (block.type === "tool") {
              const color = block.status === "done" ? "#16a34a" : "var(--color-accent)";
              const icon = block.status === "done" ? "✓" : "●";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "3px 14px",
                    fontSize: 11.5,
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    color: "var(--color-fg-muted)",
                  }}
                >
                  <span style={{ color, flexShrink: 0, fontWeight: 600 }}>{icon}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "var(--color-bg-2)",
                      fontSize: 10.5,
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {block.tool}
                  </span>
                </div>
              );
            }
            return null;
          })}

          {/* Thinking indicator */}
          {thinking && status === "streaming" && (
            <div className="enrich-thinking">
              <span className="enrich-thinking-dots">
                <span />
                <span />
                <span />
              </span>
              <span>Researching...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
