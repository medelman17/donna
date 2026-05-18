"use client";

import { useState } from "react";
import { EnrichStream } from "./enrich-stream";

export function EnrichButton({ login }: { login: string }) {
  const [streaming, setStreaming] = useState(false);

  if (streaming) {
    return <EnrichStream login={login} onDone={() => setStreaming(false)} />;
  }

  return (
    <button className="filter-btn" onClick={() => setStreaming(true)}>
      <span className="val">▸ Enrich with agent</span>
    </button>
  );
}
