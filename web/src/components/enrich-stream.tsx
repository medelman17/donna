"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { enrichComponents } from "@/lib/enrich-components";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "card"; card: string; props: Record<string, unknown> };

function tryParseCard(line: string): { card: string; props: Record<string, unknown> } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{"card"')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.card && typeof parsed.card === "string") {
      return { card: parsed.card, props: parsed.props ?? {} };
    }
  } catch {}
  return null;
}

export function EnrichStream({ login, onDone }: { login: string; onDone: () => void }) {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [partial, setPartial] = useState("");
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState<"connecting" | "streaming" | "done">("connecting");
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startRef = useRef(Date.now());
  const blocksRef = useRef<ContentBlock[]>([]);
  const lastDataRef = useRef(Date.now());
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      if (status === "streaming" && Date.now() - lastDataRef.current > 2000) {
        setThinking(true);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const pushBlock = (block: ContentBlock) => {
      const last = blocksRef.current[blocksRef.current.length - 1];
      if (block.type === "text" && last?.type === "text") {
        last.text += block.text;
        blocksRef.current = [...blocksRef.current];
      } else {
        blocksRef.current = [...blocksRef.current, block];
      }
    };

    const flushBlocks = () => setBlocks([...blocksRef.current]);

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
        let rafId = 0;

        const scheduleFlush = () => {
          cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(flushBlocks);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lastDataRef.current = Date.now();
          setThinking(false);

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let hasCard = false;
          for (const line of lines) {
            const card = line.trim() ? tryParseCard(line) : null;
            if (card) {
              pushBlock({ type: "card", card: card.card, props: card.props });
              hasCard = true;
            } else {
              pushBlock({ type: "text", text: line + "\n" });
            }
          }

          setPartial(buffer);
          if (hasCard) {
            cancelAnimationFrame(rafId);
            flushBlocks();
          } else {
            scheduleFlush();
          }
        }

        cancelAnimationFrame(rafId);

        if (buffer.trim()) {
          const card = tryParseCard(buffer);
          if (card) {
            pushBlock({ type: "card", card: card.card, props: card.props });
          } else {
            pushBlock({ type: "text", text: buffer });
          }
        }
        flushBlocks();

        setPartial("");
        setThinking(false);
        setStatus("done");
        setTimeout(() => {
          router.refresh();
          onDone();
        }, 2500);
      } catch (e: any) {
        if (e.name !== "AbortError") {
          console.error("[enrich-stream] error:", e);
        }
        setPartial("");
        setThinking(false);
        setStatus("done");
      }
    };

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [login]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks, partial, thinking]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStatus("done");
    setPartial("");
    setThinking(false);
  }, []);

  const cardCount = blocks.filter((b) => b.type === "card").length;
  const pt = partial.trim();
  const partialVisible = pt && !pt.startsWith("{");

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
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{cardCount} cards</span>
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
        {blocks.length === 0 && !partialVisible && status === "connecting" && (
          <div
            style={{
              color: "var(--color-fg-subtle)",
              fontSize: 13,
              padding: 20,
              textAlign: "center",
            }}
          >
            Starting enrichment agent...
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
          {blocks.map((block, i) => {
            if (block.type === "text") {
              const text = block.text.trim();
              if (!text) return null;
              const isLast = i === blocks.length - 1;
              const isStreaming = isLast && status === "streaming";
              return (
                <div key={i} className="enrich-prose">
                  {isStreaming ? (
                    <>
                      <span>{text}</span>
                      {!partialVisible && <span className="enrich-cursor" />}
                    </>
                  ) : (
                    <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
                  )}
                </div>
              );
            }
            if (block.type === "card") {
              const Component = enrichComponents[block.card];
              if (!Component) return null;
              return <Component key={i} props={block.props as any} />;
            }
            return null;
          })}

          {/* Streaming partial text (typewriter) */}
          {partialVisible && (
            <div className="enrich-prose">
              <span>{partial}</span>
              <span className="enrich-cursor" />
            </div>
          )}

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
