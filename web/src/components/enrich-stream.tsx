"use client";

import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import { enrichComponents } from "@/lib/enrich-components";

type ContentBlock = {
  id: string;
} & (
  | { type: "text"; text: string }
  | { type: "card"; card: string; props: Record<string, unknown> }
  | { type: "tool"; tool: string; status: "running" | "done" }
);

let blockSeq = 0;

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

    const pushBlock = (block: { type: string; [k: string]: any }) => {
      const last = blocksRef.current[blocksRef.current.length - 1];
      if (block.type === "text" && last?.type === "text") {
        last.text += block.text;
        blocksRef.current = [...blocksRef.current];
      } else {
        blocksRef.current = [...blocksRef.current, { ...block, id: `b-${++blockSeq}` } as ContentBlock];
      }
    };

    const flush = () => startTransition(() => setBlocks([...blocksRef.current]));
    const flushSync = () => setBlocks([...blocksRef.current]);
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
                flushSync();
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
                flushSync();
                break;
              }

              case "card":
                pushBlock({ type: "card", card: evt.card, props: evt.props });
                flushSync();
                if (evt.card === "TriageCard") {
                  router.refresh();
                }
                break;

              case "done":
                flushSync();
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
        flushSync();
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

  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = checkNearBottom();
      setIsNearBottom(near);
      if (near) setHasNewBelow(false);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkNearBottom]);

  useEffect(() => {
    if (isNearBottom && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    } else if (status === "streaming") {
      setHasNewBelow(true);
    }
  }, [blocks, thinking]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      setHasNewBelow(false);
      setIsNearBottom(true);
    }
  }, []);

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

        <LazyMotion features={domAnimation}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 680 }}>
            <AnimatePresence initial={false}>
              {(() => {
                const rendered: React.ReactNode[] = [];
                let i = 0;
                while (i < blocks.length) {
                  const block = blocks[i];
                  if (block.type === "text") {
                    const text = block.text.trim();
                    if (text) {
                      rendered.push(
                        <motion.div
                          key={block.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                          className="enrich-prose"
                        >
                          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
                        </motion.div>
                      );
                    }
                    i++;
                  } else if (block.type === "card") {
                    const Component = enrichComponents[block.card];
                    if (Component) {
                      rendered.push(
                        <motion.div
                          key={block.id}
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            duration: 0.35,
                            ease: [0.16, 1, 0.3, 1],
                            opacity: { duration: 0.25 },
                          }}
                        >
                          <Component props={block.props as any} />
                        </motion.div>
                      );
                    }
                    i++;
                  } else if (block.type === "tool") {
                    const toolGroup: ContentBlock[] = [];
                    while (i < blocks.length && blocks[i].type === "tool") {
                      toolGroup.push(blocks[i]);
                      i++;
                    }
                    rendered.push(
                      <motion.div
                        key={toolGroup[0].id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                          padding: "2px 0",
                          fontSize: 11,
                          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                          color: "var(--color-fg-muted)",
                        }}
                      >
                        {toolGroup.map((t) => {
                          const tb = t as ContentBlock & { type: "tool" };
                          const color = tb.status === "done" ? "#16a34a" : "var(--color-accent)";
                          const icon = tb.status === "done" ? "✓" : "●";
                          return (
                            <span key={tb.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span style={{ color, fontWeight: 600 }}>{icon}</span>
                              <span
                                style={{
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: "var(--color-bg-2)",
                                  fontSize: 10.5,
                                  fontWeight: 500,
                                }}
                              >
                                {tb.tool}
                              </span>
                            </span>
                          );
                        })}
                      </motion.div>
                    );
                  } else {
                    i++;
                  }
                }
                return rendered;
              })()}

              {/* Thinking indicator */}
              {thinking && status === "streaming" && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="enrich-thinking"
                >
                  <span className="enrich-thinking-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span>Researching...</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </LazyMotion>

        {/* Scroll-to-bottom pill */}
        <AnimatePresence>
          {hasNewBelow && status === "streaming" && (
            <motion.button
              key="scroll-btn"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={scrollToBottom}
              style={{
                position: "sticky",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid var(--color-border)",
                background: "var(--color-panel)",
                boxShadow: "0 4px 12px rgba(15, 17, 28, 0.1), 0 1px 3px rgba(15, 17, 28, 0.06)",
                color: "var(--color-accent)",
                fontSize: 11.5,
                fontWeight: 500,
                fontFamily: "inherit",
                cursor: "pointer",
                zIndex: 10,
              }}
            >
              ↓ New content below
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
