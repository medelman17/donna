"use client";

import { useState, useEffect } from "react";
import { EnrichStream } from "./enrich-stream";

export function DetailWithEnrich({
  login,
  initialEnriching,
  children,
}: {
  login: string;
  initialEnriching?: boolean;
  children: React.ReactNode;
}) {
  const [streaming, setStreaming] = useState(initialEnriching ?? false);

  useEffect(() => {
    if (initialEnriching) return;
    fetch(`/api/enrich/${login}`)
      .then(r => r.json())
      .then(data => {
        if (data.enriching) setStreaming(true);
      })
      .catch(() => {});
  }, [login, initialEnriching]);

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
