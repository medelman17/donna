"use client";

import { useState } from "react";

export function MobileSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`detail-aside mobile-sheet ${open ? "sheet-open" : ""}`}
      onClick={open ? undefined : () => setOpen(true)}>
      <div className="sheet-header">
        <span className="sheet-pill" />
        {open && (
          <button className="sheet-close" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
            ✕
          </button>
        )}
      </div>
      <div className="sheet-content">
        {children}
      </div>
    </aside>
  );
}
