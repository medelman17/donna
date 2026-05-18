"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PopoverOption = { value: string; label: string; swatch?: string };

function FilterPopover({
  label, value, options, onChange, align = "left",
}: {
  label: string; value: string; options: PopoverOption[];
  onChange: (v: string) => void; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = options.find(o => o.value === value);
  const isActive = value && value !== "all" && value !== "0";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="filter-btn" data-active={isActive || undefined} onClick={() => setOpen(!open)}>
        <span className="lbl">{label}:</span>
        <span className="val">{current?.label ?? "All"}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="pop" style={{ top: "calc(100% + 4px)", [align]: 0 }}>
          {options.map(o => (
            <div key={o.value} className="pop-item" data-active={o.value === value || undefined}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.swatch && <span className="swatch" style={{ background: o.swatch }} />}
              <span>{o.label}</span>
              {o.value === value && <span className="check-mark">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_OPTS: PopoverOption[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New", swatch: "#8a8e9d" },
  { value: "enriched", label: "Enriched", swatch: "#06b6d4" },
  { value: "reviewing", label: "Reviewing", swatch: "#3b82f6" },
  { value: "interested", label: "Interested", swatch: "#8b5cf6" },
  { value: "contacted", label: "Contacted", swatch: "#f59e0b" },
  { value: "passed", label: "Passed", swatch: "#a08879" },
  { value: "hired", label: "Hired", swatch: "#16a34a" },
];
const SENIORITY_OPTS: PopoverOption[] = [
  { value: "all", label: "All" },
  { value: "junior", label: "Junior" }, { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" }, { value: "staff", label: "Staff" },
  { value: "unknown", label: "Unknown" },
];
const FIT_OPTS: PopoverOption[] = [
  { value: "0", label: "Any" }, { value: "5", label: "5 only" },
  { value: "4", label: "4+" }, { value: "3", label: "3+" }, { value: "2", label: "2+" },
];
const LANG_OPTS: PopoverOption[] = [
  { value: "all", label: "All" },
  ...["TypeScript", "Python", "Rust", "Go", "Elixir", "Java"].map(l => ({ value: l, label: l })),
];
const SORT_OPTS: PopoverOption[] = [
  { value: "fit-desc", label: "Fit score (high → low)" },
  { value: "fit-asc", label: "Fit score (low → high)" },
  { value: "followers-desc", label: "Followers" },
  { value: "repos-desc", label: "Public repos" },
  { value: "commits-desc", label: "Commits" },
  { value: "fetched-desc", label: "Recently fetched" },
  { value: "name-asc", label: "Name (A–Z)" },
];

function ReseedButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "seeding" | "done">("idle");

  const reseed = async () => {
    if (state === "seeding") return;
    setState("seeding");
    try {
      await fetch("/api/seed", { method: "POST" }).then((r) => r.json());
      await fetch("/api/seed/hydrate", { method: "POST" }).then((r) => r.json());
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
    }
  };

  return (
    <button className="reseed-btn" onClick={reseed} disabled={state === "seeding"}
      title="Sync new forkers, stargazers, contributors from GitHub">
      <span className={state === "seeding" ? "reseed-spin" : ""}>
        {state === "done" ? "✓" : "↻"}
      </span>
    </button>
  );
}

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const get = (k: string, def: string) => sp.get(k) ?? def;

  const set = useCallback((k: string, v: string) => {
    const p = new URLSearchParams(sp.toString());
    if (!v || v === "all" || v === "0" || v === "") p.delete(k);
    else p.set(k, v);
    router.replace(`/?${p.toString()}`, { scroll: false });
  }, [router, sp]);

  const setQ = (v: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => set("q", v), 200);
  };

  const hasCommits = get("hasCommits", "false") === "true";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="toolbar">
      <div className="search max-sm:!w-full max-sm:order-first">
        <span style={{ color: "var(--color-fg-subtle)" }}>⌕</span>
        <input ref={searchRef} type="text" placeholder="Search name, login, bio…"
          defaultValue={get("q", "")} onChange={e => setQ(e.target.value)} />
        <kbd className="max-sm:hidden">/</kbd>
      </div>
      <div className="max-sm:hidden contents sm:contents">
        <FilterPopover label="Status" value={get("status", "all")} options={STATUS_OPTS} onChange={v => set("status", v)} />
        <FilterPopover label="Seniority" value={get("seniority", "all")} options={SENIORITY_OPTS} onChange={v => set("seniority", v)} />
        <FilterPopover label="Fit" value={get("minFit", "0")} options={FIT_OPTS} onChange={v => set("minFit", v)} />
        <FilterPopover label="Lang" value={get("language", "all")} options={LANG_OPTS} onChange={v => set("language", v)} />
        <button className="toggle-pill" data-on={hasCommits || undefined}
          onClick={() => set("hasCommits", hasCommits ? "" : "true")}>
          <span className="check-box">{hasCommits && <span style={{ fontSize: 9 }}>✓</span>}</span>
          Own commits
        </button>
        <button className="toggle-pill" data-on={get("bookmarked", "false") === "true" || undefined}
          onClick={() => set("bookmarked", get("bookmarked", "false") === "true" ? "" : "true")}
          style={get("bookmarked", "false") === "true" ? { borderColor: "color-mix(in oklab, #f59e0b, transparent 40%)", color: "#f59e0b" } : undefined}>
          <span style={{ fontSize: 12 }}>{get("bookmarked", "false") === "true" ? "★" : "☆"}</span>
          Saved
        </button>
      </div>
      <ReseedButton />
      <div className="right">
        <FilterPopover label="Sort" value={get("sort", "fit-desc")} options={SORT_OPTS}
          onChange={v => set("sort", v)} align="right" />
      </div>
    </div>
  );
}
