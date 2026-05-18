"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type LogEntry = { tool: string; error: string | null; durationMs: number | null; createdAt: string };

export function EnrichButton({ login }: { login: string }) {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toolCalls, setToolCalls] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startCountRef = useRef(0);
  const router = useRouter();

  const trigger = async () => {
    const res = await fetch(`/api/enrich/${login}`);
    const data = await res.json();
    startCountRef.current = data.toolCalls;

    setStatus("running");
    setLogs([]);
    await fetch(`/api/enrich/${login}`, { method: "POST" });

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/enrich/${login}`);
      const data = await res.json();
      setToolCalls(data.toolCalls - startCountRef.current);
      setLogs(data.recentLogs);

      if (data.toolCalls > startCountRef.current + 2) {
        setTimeout(async () => {
          const res2 = await fetch(`/api/enrich/${login}`);
          const data2 = await res2.json();
          if (data2.toolCalls === data.toolCalls && data2.toolCalls > startCountRef.current + 3) {
            clearInterval(pollRef.current);
            setStatus("done");
            router.refresh();
          }
        }, 8000);
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(pollRef.current);
      setStatus((prev) => {
        if (prev === "running") {
          router.refresh();
          return "done";
        }
        return prev;
      });
    }, 180000);
  };

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  return (
    <div>
      {status === "idle" && (
        <button className="filter-btn" onClick={trigger}>
          <span className="val">&#9654; Enrich with agent</span>
        </button>
      )}
      {status === "running" && (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: "var(--color-accent)", fontWeight: 600, marginBottom: 6 }}>
            Enriching... ({toolCalls} tool calls)
          </div>
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                fontSize: 11,
                color: l.error ? "#dc2626" : "var(--color-fg-muted)",
                padding: "1px 0",
                fontFamily: "var(--font-geist-mono)",
              }}>
                {l.tool} {l.durationMs ? `(${l.durationMs}ms)` : ""} {l.error ? `— ${l.error}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
      {status === "done" && (
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "#16a34a", fontWeight: 500 }}>&#10003; Enrichment complete</span>
          <span style={{ color: "var(--color-fg-muted)", marginLeft: 4 }}>({toolCalls} tool calls)</span>
          <button className="tb-link" onClick={() => { setStatus("idle"); router.refresh(); }} style={{ marginLeft: 8 }}>
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
