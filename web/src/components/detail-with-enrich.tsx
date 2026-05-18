"use client";

import { useState } from "react";
import { EnrichStream } from "./enrich-stream";

export function DetailWithEnrich({
  login,
  children,
}: {
  login: string;
  children: React.ReactNode;
}) {
  const [streaming, setStreaming] = useState(false);

  if (streaming) {
    return (
      <main className="detail-main">
        <EnrichStream login={login} onDone={() => setStreaming(false)} />
      </main>
    );
  }

  return (
    <main className="detail-main">
      <div className="dx">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <a href="/" className="tb-link" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>&larr; All candidates</a>
          <button className="filter-btn" onClick={() => setStreaming(true)}>
            <span className="val">&#9654; Enrich with agent</span>
          </button>
        </div>
        {children}
      </div>
    </main>
  );
}
