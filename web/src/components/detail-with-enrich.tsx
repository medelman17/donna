"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { EnrichStream } from "./enrich-stream";

const EnrichCtx = createContext<(() => void) | null>(null);
export function useEnrich() { return useContext(EnrichCtx); }

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
    <EnrichCtx.Provider value={() => setStreaming(true)}>
      <main className="detail-main">
        <div className="dx">
          {children}
        </div>
      </main>
    </EnrichCtx.Provider>
  );
}
