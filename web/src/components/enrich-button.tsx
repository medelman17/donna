"use client";

import { useEnrich } from "./detail-with-enrich";

export function EnrichButton() {
  const enrich = useEnrich();
  if (!enrich) return null;
  return (
    <button className="enrich-fab" onClick={enrich}>
      ▶ Enrich
    </button>
  );
}
