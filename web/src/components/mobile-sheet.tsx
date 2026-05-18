"use client";

import { useState } from "react";

export function MobileSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`detail-aside mobile-sheet ${open ? "sheet-open" : ""}`}>
      <div className="sheet-header">
        <button className="sheet-handle" onClick={() => setOpen(!open)}>
          <span className="sheet-pill" />
        </button>
        {open && (
          <button className="sheet-close" onClick={() => setOpen(false)}>
            ✕ Close
          </button>
        )}
      </div>
      <div className="sheet-content">
        {children}
      </div>
    </aside>
  );
}
