"use client";

import { useState } from "react";

export function MobileSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`detail-aside mobile-sheet ${open ? "sheet-open" : ""}`}>
      <button className="sheet-handle" onClick={() => setOpen(!open)}>
        <span className="sheet-pill" />
        <span className="sheet-label">{open ? "Close" : "Details"}</span>
      </button>
      <div className="sheet-content">
        {children}
      </div>
    </aside>
  );
}
