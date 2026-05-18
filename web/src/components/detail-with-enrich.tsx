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
      <div className="dx" style={{ position: "relative" }}>
        <button className="enrich-fab" onClick={() => setStreaming(true)}>
          ▶ Enrich
        </button>
        {children}
      </div>
    </main>
  );
}
