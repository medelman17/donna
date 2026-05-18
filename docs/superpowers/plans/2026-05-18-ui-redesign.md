# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder web UI with the high-fidelity Linear-style design from `design_handoff_talent_scout/`, producing a pixel-perfect dense CRM with 9-column grid rows, custom filter popovers, keyboard navigation, assessment cards, LinkedIn timeline, and a sticky CRM sidebar.

**Architecture:** The existing Prisma queries, server actions, and filter helpers stay mostly intact. The changes are purely presentational: new CSS design system (tokens + custom classes in globals.css), rewritten React components using a mix of Tailwind utilities and custom CSS classes, Geist font via next/font, and a full-viewport grid layout replacing the max-width container. Server/client component boundaries remain the same (RSC for data, client for interactivity).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (@theme tokens), shadcn/ui (Select, Input, Textarea for CRM panel only), Lucide React, Geist + Geist Mono via next/font/google.

**Design reference:** `design_handoff_talent_scout/README.md` is the canonical spec. `app.css` has all tokens/styles. `list-view.jsx` and `detail-view.jsx` have component structure. Build **Linear theme, ultra density, chip fit-score, right sidebar only** — no variants.

---

## File Map

Files marked `rewrite` are completely replaced. Files marked `new` are created. Files marked `keep` are unchanged.

```
web/src/
├── app/
│   ├── globals.css                    (REWRITE — design tokens + all custom CSS)
│   ├── layout.tsx                     (REWRITE — Geist font, viewport grid, topbar)
│   ├── page.tsx                       (REWRITE — expanded query, RSC list with meta strip)
│   └── candidates/[login]/
│       ├── page.tsx                   (REWRITE — full detail page with 2-col grid)
│       └── actions.ts                 (KEEP — server action unchanged)
├── components/
│   ├── ui/                            (KEEP — shadcn primitives)
│   ├── topbar.tsx                     (NEW — shared topbar with logo, crumb, pipeline meta)
│   ├── avatar.tsx                     (NEW — initials-on-color fallback + real img)
│   ├── atoms.tsx                      (NEW — StatusPill, FitChip, LangBadge, fmtNum, relTime)
│   ├── filter-bar.tsx                 (REWRITE — custom popovers, search+kbd, toggle pill)
│   ├── candidate-row.tsx              (REWRITE — 9-column CSS grid, 36px dense)
│   ├── list-keyboard-nav.tsx          (NEW — client wrapper for j/k/enter/slash)
│   ├── meta-strip.tsx                 (NEW — server component, live counts)
│   ├── assessment-card.tsx            (NEW — 44px fit number, dots, confidence bar, outreach)
│   ├── signal-list.tsx                (REWRITE — grouped by kind, grid layout, icon circles)
│   ├── linkedin-block.tsx             (NEW — timeline, education, skills)
│   ├── repo-card.tsx                  (REWRITE — grid 1fr auto, accent name link)
│   ├── web-mention.tsx                (NEW — grid 60px 1fr, source-colored labels)
│   ├── activity-list.tsx              (NEW — 3-col grid, scrollable, mono event tags)
│   ├── crm-panel.tsx                  (REWRITE — saving indicator, snapshot, fork, kbd help)
│   ├── detail-keyboard-nav.tsx        (NEW — client wrapper for esc/j/k)
│   ├── status-pill.tsx                (DELETE — merged into atoms.tsx)
├── lib/
│   ├── filters.ts                     (MODIFY — update param names + sort values)
│   ├── prisma.ts                      (KEEP)
│   └── utils.ts                       (KEEP)
```

---

## Task 1: Design System Foundation

**Files:**
- Rewrite: `web/src/app/globals.css`
- Rewrite: `web/src/app/layout.tsx`
- Create: `web/src/components/topbar.tsx`

This task establishes the design tokens, all custom CSS classes, Geist font, and the shared topbar. Every subsequent task depends on this.

- [ ] **Step 1: Rewrite `web/src/app/globals.css`**

Replace the entire file. This contains: Tailwind import, `@theme` block with design tokens, and all custom CSS classes ported from the design's `app.css` (Linear theme only, no variants).

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  --color-bg: #fbfbfc;
  --color-bg-2: #f5f5f7;
  --color-panel: #ffffff;
  --color-border: #e8e8ec;
  --color-border-strong: #d8d8de;
  --color-fg: #1a1a1f;
  --color-fg-muted: #5b5b66;
  --color-fg-subtle: #8a8a96;
  --color-accent: #5e6ad2;
  --color-accent-bg: #eef0fb;
  --color-row-hover: #f4f5f9;
  --color-row-sel: #eef0fb;
  --shadow-sm: 0 1px 2px rgba(15, 17, 28, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 17, 28, 0.06), 0 1px 2px rgba(15, 17, 28, 0.04);
  --radius-DEFAULT: 6px;
  --radius-sm: 4px;
  --radius-lg: 10px;
}

/* ─── Base ──────────────────────────────────────────────────────────────── */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body {
  color: var(--color-fg);
  background: var(--color-bg);
  font-size: 13px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "cv11", "ss01", "ss03";
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */
.app-shell {
  display: grid;
  grid-template-rows: 44px 1fr;
  height: 100vh;
}

/* ─── Topbar ────────────────────────────────────────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
}
.topbar .logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.topbar .logo-mark {
  width: 18px; height: 18px; border-radius: 5px;
  background: linear-gradient(135deg, var(--color-accent) 0%, color-mix(in oklab, var(--color-accent), black 22%) 100%);
  display: grid; place-items: center;
  color: #fff; font-size: 11px; font-weight: 700;
}
.topbar .crumb { color: var(--color-fg-subtle); font-size: 13px; }
.topbar .crumb a { color: var(--color-fg-muted); text-decoration: none; }
.topbar .crumb a:hover { color: var(--color-fg); }
.topbar .spacer { flex: 1; }
.topbar .meta {
  color: var(--color-fg-subtle); font-size: 12px;
  display: flex; align-items: center; gap: 14px;
}
.topbar .meta .live-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; border-radius: 999px;
  background: var(--color-bg-2); color: var(--color-fg-muted);
  border: 1px solid var(--color-border); font-size: 11.5px;
}
.topbar .meta .live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
  box-shadow: 0 0 0 2px color-mix(in oklab, #4ade80, transparent 80%);
}

/* ─── List page ─────────────────────────────────────────────────────────── */
.list-page { display: flex; flex-direction: column; min-height: 0; }

.toolbar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-panel);
  flex-wrap: wrap;
}
.toolbar .search {
  display: flex; align-items: center; gap: 6px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-DEFAULT);
  padding: 5px 8px; width: 280px;
}
.toolbar .search:focus-within {
  border-color: color-mix(in oklab, var(--color-accent), transparent 50%);
  background: var(--color-panel);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent), transparent 88%);
}
.toolbar .search input {
  border: 0; outline: 0; background: transparent;
  font: inherit; color: var(--color-fg); width: 100%;
}
.toolbar .search input::placeholder { color: var(--color-fg-subtle); }
.toolbar .search kbd {
  font-family: var(--font-geist-mono); font-size: 10.5px;
  color: var(--color-fg-subtle); padding: 1px 5px;
  border: 1px solid var(--color-border); border-bottom-width: 2px;
  border-radius: 3px; background: var(--color-panel);
}

.filter-btn {
  appearance: none;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-DEFAULT);
  color: var(--color-fg-muted); font: inherit; cursor: default; font-size: 12px;
}
.filter-btn:hover { background: var(--color-bg-2); color: var(--color-fg); }
.filter-btn[data-active="true"] {
  background: var(--color-accent-bg);
  border-color: color-mix(in oklab, var(--color-accent), transparent 60%);
  color: var(--color-accent);
}
.filter-btn .lbl { color: var(--color-fg-subtle); font-weight: 500; }
.filter-btn .val { color: var(--color-fg); font-weight: 500; }
.filter-btn[data-active="true"] .lbl,
.filter-btn[data-active="true"] .val { color: var(--color-accent); }
.filter-btn .chev { color: var(--color-fg-subtle); margin-left: 2px; }

.toggle-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px 4px 8px; background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-DEFAULT);
  color: var(--color-fg-muted); font-size: 12px; cursor: default;
}
.toggle-pill:hover { background: var(--color-bg-2); }
.toggle-pill[data-on="true"] {
  background: var(--color-accent-bg);
  border-color: color-mix(in oklab, var(--color-accent), transparent 60%);
  color: var(--color-accent);
}
.toggle-pill .check-box {
  width: 12px; height: 12px; border-radius: 3px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-panel);
  display: grid; place-items: center;
}
.toggle-pill[data-on="true"] .check-box {
  background: var(--color-accent); border-color: var(--color-accent); color: #fff;
}

.toolbar .right { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.tb-divider { width: 1px; height: 18px; background: var(--color-border); margin: 0 4px; }
.tb-link {
  appearance: none; background: transparent; border: 0;
  color: var(--color-fg-subtle); font: inherit; padding: 4px 6px;
  cursor: default; font-size: 12px; border-radius: var(--radius-sm);
}
.tb-link:hover { color: var(--color-fg); background: var(--color-bg-2); }

/* Filter popover */
.pop {
  position: absolute; background: var(--color-panel);
  border: 1px solid var(--color-border); border-radius: 8px;
  box-shadow: var(--shadow-md); min-width: 180px; padding: 4px; z-index: 50;
}
.pop-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border-radius: 4px;
  cursor: default; font-size: 12.5px;
}
.pop-item:hover { background: var(--color-bg-2); }
.pop-item[data-active="true"] { color: var(--color-accent); }
.pop-item .swatch { width: 8px; height: 8px; border-radius: 50%; }
.pop-item .check-mark { margin-left: auto; color: var(--color-accent); }

/* Meta strip */
.metastrip {
  display: flex; align-items: center; gap: 18px;
  padding: 6px 14px; border-bottom: 1px solid var(--color-border);
  background: var(--color-bg); color: var(--color-fg-subtle); font-size: 11.5px;
}
.metastrip b { color: var(--color-fg); font-weight: 600; font-variant-numeric: tabular-nums; }

/* Column header */
.row-head {
  display: grid; grid-template-columns: var(--cols);
  padding: 0 14px; height: 28px; align-items: center;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg); color: var(--color-fg-subtle);
  font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase;
  font-weight: 600; position: sticky; top: 0; z-index: 5;
}
.row-head > div { padding-right: 8px; }
.row-head .sortable { cursor: default; display: inline-flex; align-items: center; gap: 4px; }
.row-head .sortable:hover { color: var(--color-fg-muted); }
.row-head .sortable[data-sorted="true"] { color: var(--color-fg); }
.row-head .sortable .arrow { font-size: 9px; opacity: 0.8; }

/* Rows */
.list-scroll {
  flex: 1; min-height: 0; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.18) transparent;
}
.row {
  display: grid; grid-template-columns: var(--cols);
  padding: 0 14px; height: 36px; align-items: center;
  border-bottom: 1px solid var(--color-border);
  cursor: default; font-size: 12.5px;
}
.row:hover { background: var(--color-row-hover); }
.row[data-active="true"] { background: var(--color-row-sel); }
.row > div { padding-right: 8px; min-width: 0; overflow: hidden; }
.row .who { display: flex; align-items: center; gap: 9px; min-width: 0; }
.row .who .name { font-weight: 500; color: var(--color-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .who .login { color: var(--color-fg-subtle); font-size: 12px; }
.row .who-stack { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
.row .summary { color: var(--color-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .loc { color: var(--color-fg-subtle); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .langs { display: flex; gap: 4px; flex-wrap: nowrap; overflow: hidden; }
.row .nums { color: var(--color-fg-muted); font-variant-numeric: tabular-nums; font-size: 12px; text-align: right; }
.row .fit-cell { display: flex; justify-content: flex-start; align-items: center; }
.row .stat { display: flex; justify-content: flex-start; }

/* ─── Avatar ────────────────────────────────────────────────────────────── */
.av {
  width: var(--av-size, 22px); height: var(--av-size, 22px);
  flex-shrink: 0; display: grid; place-items: center;
  color: rgba(255,255,255,0.95);
  font-size: calc(var(--av-size, 22px) * 0.45);
  font-weight: 600; letter-spacing: -0.01em;
  border-radius: 5px; text-transform: uppercase;
  user-select: none; overflow: hidden;
}
.av img { width: 100%; height: 100%; object-fit: cover; }

/* ─── Lang badge ────────────────────────────────────────────────────────── */
.lang {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 6px 1px 4px; border-radius: 999px;
  background: var(--color-bg-2); border: 1px solid var(--color-border);
  color: var(--color-fg-muted); font-size: 11px; white-space: nowrap;
}
.lang .dot { width: 7px; height: 7px; border-radius: 50%; }

/* ─── Status pills ──────────────────────────────────────────────────────── */
.st-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 1px 7px; border-radius: 999px;
  font-size: 11px; font-weight: 500; white-space: nowrap;
}
.st-pill .dot { width: 6px; height: 6px; border-radius: 50%; }
.st-new       { background: #f1f2f6; color: #4a5060; }
.st-new .dot  { background: #8a8e9d; }
.st-reviewing { background: #e6f1ff; color: #245aa6; }
.st-reviewing .dot { background: #3b82f6; }
.st-interested{ background: #ede5ff; color: #6a3fc2; }
.st-interested .dot { background: #8b5cf6; }
.st-contacted { background: #fff0e0; color: #a4581f; }
.st-contacted .dot { background: #f59e0b; }
.st-passed    { background: #f4f0ed; color: #7a6357; }
.st-passed .dot { background: #a08879; }
.st-hired     { background: #dff5e6; color: #1f7a3e; }
.st-hired .dot { background: #16a34a; }

/* ─── Fit score chip ────────────────────────────────────────────────────── */
.fit-chip {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 18px; padding: 0 5px;
  border-radius: 4px; font-size: 11.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
}
.fit-1 { background: #eceff3; color: #5c6473; }
.fit-2 { background: #fbecd6; color: #8a6a1f; }
.fit-3 { background: #dfeaff; color: #2d5cb1; }
.fit-4 { background: #d8efde; color: #1f7a3e; }
.fit-5 { background: #c7ecd2; color: #0f6b32; box-shadow: inset 0 0 0 1px #9ad7af; }

.fit-dots { display: inline-flex; gap: 3px; }
.fit-dots .d { width: 6px; height: 6px; border-radius: 50%; background: var(--color-border-strong); }
.fit-dots .d.on { background: currentColor; }
.fit-dots[data-tier="1"] { color: #8a8e9d; }
.fit-dots[data-tier="2"] { color: #d08b1c; }
.fit-dots[data-tier="3"] { color: #3b82f6; }
.fit-dots[data-tier="4"] { color: #16a34a; }
.fit-dots[data-tier="5"] { color: #0f7a37; }

/* Commit flag */
.commit-flag {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; color: var(--color-fg-subtle); font-variant-numeric: tabular-nums;
}
.commit-flag .glyph { color: #16a34a; font-weight: 600; }

/* ─── Detail page ───────────────────────────────────────────────────────── */
.detail-grid {
  display: grid; grid-template-columns: 1fr 320px;
  height: 100%; min-height: 0;
}
.detail-main {
  overflow-y: auto; scrollbar-width: thin;
  scrollbar-color: rgba(0,0,0,0.18) transparent;
}
.detail-aside {
  border-left: 1px solid var(--color-border);
  background: var(--color-panel); overflow-y: auto; scrollbar-width: thin;
}
.dx { padding: 22px 28px; max-width: 920px; }

.detail-header {
  display: flex; gap: 18px; align-items: flex-start;
  padding-bottom: 18px; border-bottom: 1px solid var(--color-border); margin-bottom: 18px;
}
.detail-header .h-meta { flex: 1; min-width: 0; }
.detail-header .h-name {
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px;
}
.detail-header .h-name h1 {
  margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.012em; color: var(--color-fg);
}
.detail-header .h-name .login { color: var(--color-fg-subtle); font-size: 14px; }
.detail-header .h-bio {
  color: var(--color-fg-muted); margin: 4px 0 10px; max-width: 620px; text-wrap: pretty;
}
.detail-header .h-row {
  display: flex; gap: 14px; flex-wrap: wrap;
  color: var(--color-fg-subtle); font-size: 12px; align-items: center;
}
.detail-header .h-row a {
  color: var(--color-fg-muted); text-decoration: none;
  display: inline-flex; align-items: center; gap: 4px;
}
.detail-header .h-row a:hover { color: var(--color-accent); }
.dotsep { color: var(--color-border-strong); }

/* Assessment card */
.assess {
  display: grid; grid-template-columns: 88px 1fr; gap: 22px;
  background: var(--color-bg-2); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); padding: 16px 18px; margin-bottom: 24px;
}
.assess .fit-lg { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.assess .fit-num {
  font-size: 44px; font-weight: 700; letter-spacing: -0.04em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.assess .fit-num .of { color: var(--color-fg-subtle); font-size: 18px; font-weight: 500; }
.assess .fit-lbl {
  font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--color-fg-subtle); font-weight: 600;
}
.assess .body { min-width: 0; }
.assess .h { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.assess .sen-badge {
  display: inline-flex; padding: 1px 6px; border-radius: 4px;
  background: var(--color-panel); border: 1px solid var(--color-border);
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--color-fg-muted);
}
.assess .conf {
  font-size: 11px; color: var(--color-fg-subtle);
  display: inline-flex; align-items: center; gap: 6px;
}
.assess .conf .bar {
  display: inline-block; width: 60px; height: 4px; border-radius: 999px;
  background: var(--color-border); overflow: hidden;
}
.assess .conf .bar > i { display: block; height: 100%; background: var(--color-fg-muted); }
.assess .summary { color: var(--color-fg); font-size: 13.5px; line-height: 1.55; text-wrap: pretty; }
.assess .reasoning {
  margin-top: 10px; color: var(--color-fg-muted);
  font-size: 12.5px; line-height: 1.55; text-wrap: pretty;
}
.assess .outreach {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed var(--color-border-strong);
  display: flex; align-items: flex-start; gap: 10px; font-size: 12.5px;
}
.verdict {
  display: inline-flex; padding: 1px 8px; border-radius: 999px;
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; flex-shrink: 0;
}
.verdict-yes { background: #d8efde; color: #1f7a3e; }
.verdict-maybe { background: #dfeaff; color: #2d5cb1; }
.verdict-no { background: #f4f0ed; color: #7a6357; }

/* Section headers */
.section { margin-bottom: 26px; }
.section-h {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 10px; border-bottom: 1px solid var(--color-border); padding-bottom: 6px;
}
.section-h h2 {
  margin: 0; font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-fg-muted);
}
.section-h .count {
  color: var(--color-fg-subtle); font-size: 11.5px; font-variant-numeric: tabular-nums;
}

/* Signals */
.signal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }
.signal {
  display: grid; grid-template-columns: 14px 1fr; gap: 8px;
  padding: 8px 10px; border: 1px solid var(--color-border);
  border-radius: var(--radius-DEFAULT); background: var(--color-panel);
  font-size: 12.5px; line-height: 1.45; align-items: start;
}
.signal .ico {
  width: 14px; height: 14px; border-radius: 50%;
  display: grid; place-items: center;
  font-size: 10px; color: #fff; font-weight: 700; margin-top: 2px;
}
.signal[data-kind="positive"] { border-color: color-mix(in oklab, #16a34a, transparent 70%); background: color-mix(in oklab, #16a34a, transparent 95%); }
.signal[data-kind="positive"] .ico { background: #16a34a; }
.signal[data-kind="negative"] { border-color: color-mix(in oklab, #dc2626, transparent 70%); background: color-mix(in oklab, #dc2626, transparent 96%); }
.signal[data-kind="negative"] .ico { background: #dc2626; }
.signal[data-kind="notable"] { border-color: color-mix(in oklab, #2563eb, transparent 70%); background: color-mix(in oklab, #2563eb, transparent 96%); }
.signal[data-kind="notable"] .ico { background: #2563eb; }
.signal .text { color: var(--color-fg); text-wrap: pretty; }

/* Tags */
.tags-cloud { display: flex; gap: 5px; flex-wrap: wrap; }
.tags-cloud .tag {
  padding: 2px 8px; border-radius: 999px;
  background: var(--color-bg-2); border: 1px solid var(--color-border);
  color: var(--color-fg-muted); font-size: 11.5px; font-weight: 500;
}

/* LinkedIn block */
.li-block { border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
.li-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  background: linear-gradient(180deg, color-mix(in oklab, #0a66c2, transparent 92%), transparent);
  border-bottom: 1px solid var(--color-border);
}
.li-mark {
  width: 18px; height: 18px; border-radius: 3px;
  background: #0a66c2; color: #fff;
  display: grid; place-items: center;
  font-weight: 700; font-size: 11px;
}
.li-headline { color: var(--color-fg); font-weight: 500; }
.li-conn { color: var(--color-fg-subtle); font-size: 11.5px; margin-left: auto; }
.li-body { padding: 14px 16px; }
.timeline .role {
  display: grid; grid-template-columns: 28px 1fr auto; gap: 10px;
  padding: 10px 0; border-bottom: 1px dashed var(--color-border);
}
.timeline .role:last-child { border-bottom: 0; }
.timeline .role .marker {
  width: 28px; height: 28px; border-radius: 4px;
  background: var(--color-bg-2); border: 1px solid var(--color-border);
  display: grid; place-items: center;
  font-size: 11px; font-weight: 600; color: var(--color-fg-muted);
}
.timeline .role .title { color: var(--color-fg); font-weight: 500; font-size: 13px; }
.timeline .role .company { color: var(--color-fg-muted); font-size: 12px; }
.timeline .role .descr {
  color: var(--color-fg-muted); font-size: 12px; margin-top: 4px;
  line-height: 1.45; text-wrap: pretty;
}
.timeline .role .dates {
  color: var(--color-fg-subtle); font-size: 11.5px;
  font-variant-numeric: tabular-nums; text-align: right;
}
.li-sub {
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
  margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--color-border);
}
.li-sub h4 {
  margin: 0 0 6px; font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-fg-subtle);
}
.li-sub .school { color: var(--color-fg); font-weight: 500; font-size: 12.5px; }
.li-sub .deg { color: var(--color-fg-muted); font-size: 11.5px; }
.li-sub .yrs { color: var(--color-fg-subtle); font-size: 11px; }

/* Repos */
.repo-list { display: flex; flex-direction: column; gap: 6px; }
.repo {
  display: grid; grid-template-columns: 1fr auto; gap: 14px;
  padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-DEFAULT);
}
.repo .r-name {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--color-accent); font-weight: 500; font-size: 13px; text-decoration: none;
}
.repo .r-name:hover { text-decoration: underline; }
.repo .r-fork-flag {
  font-size: 10.5px; padding: 0 5px; border-radius: 3px;
  background: var(--color-bg-2); border: 1px solid var(--color-border);
  color: var(--color-fg-subtle); font-weight: 500;
}
.repo .r-descr { color: var(--color-fg-muted); font-size: 12.5px; margin-top: 3px; text-wrap: pretty; }
.repo .r-meta {
  display: flex; align-items: center; gap: 12px;
  color: var(--color-fg-subtle); font-size: 11.5px;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.repo .r-meta .item { display: inline-flex; align-items: center; gap: 4px; }

/* Web mentions */
.web-list { display: flex; flex-direction: column; gap: 8px; }
.web {
  display: grid; grid-template-columns: 60px 1fr; gap: 12px;
  padding: 10px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-DEFAULT);
}
.web .src {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--color-fg-subtle); padding-top: 1px;
}
.web .src[data-s="blog"] { color: #b2603b; }
.web .src[data-s="conference"] { color: #6a3fc2; }
.web .src[data-s="google"] { color: #245aa6; }
.web .src[data-s="github_mentions"] { color: #1f7a3e; }
.web .body .t { color: var(--color-fg); font-weight: 500; font-size: 13px; text-decoration: none; }
.web .body .t:hover { color: var(--color-accent); text-decoration: underline; }
.web .body .sn {
  color: var(--color-fg-muted); font-size: 12px; margin-top: 4px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* Activity */
.act-list { display: flex; flex-direction: column; max-height: 280px; overflow-y: auto; }
.act {
  display: grid; grid-template-columns: 90px 110px 1fr;
  gap: 10px; align-items: center; padding: 4px 0;
  font-size: 12px; border-bottom: 1px solid var(--color-border);
}
.act .when { color: var(--color-fg-subtle); font-variant-numeric: tabular-nums; font-size: 11.5px; }
.act .ev {
  display: inline-flex; padding: 1px 6px; border-radius: 3px;
  background: var(--color-bg-2); color: var(--color-fg-muted);
  font-size: 10.5px; font-weight: 500; font-family: var(--font-geist-mono);
  width: max-content;
}
.act .repo-n { color: var(--color-fg-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ─── CRM aside ─────────────────────────────────────────────────────────── */
.aside { padding: 20px; display: flex; flex-direction: column; gap: 20px; position: sticky; top: 0; }
.aside h3 {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--color-fg-subtle); margin: 0 0 8px;
}
.aside .field { display: flex; flex-direction: column; gap: 6px; }
.aside .field label {
  font-size: 11px; color: var(--color-fg-subtle);
  display: flex; align-items: center; justify-content: space-between;
}
.aside .saving { font-size: 10.5px; color: var(--color-fg-subtle); font-style: italic; }
.aside .saving.ok { color: #16a34a; font-style: normal; }
.aside select, .aside input, .aside textarea {
  appearance: none; font: inherit; color: var(--color-fg);
  background: var(--color-panel); border: 1px solid var(--color-border);
  border-radius: var(--radius-DEFAULT); padding: 6px 9px; width: 100%; outline: none; font-size: 13px;
}
.aside select:focus, .aside input:focus, .aside textarea:focus {
  border-color: color-mix(in oklab, var(--color-accent), transparent 50%);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-accent), transparent 88%);
}
.aside textarea { min-height: 100px; resize: vertical; line-height: 1.5; }
.qstats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.qstats .qs { border: 1px solid var(--color-border); border-radius: var(--radius-DEFAULT); padding: 8px 10px; }
.qstats .qs .k { font-size: 10.5px; color: var(--color-fg-subtle); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.qstats .qs .v { font-size: 15px; color: var(--color-fg); font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 1px; }
.qstats .qs .sub { font-size: 11px; color: var(--color-fg-muted); }
.kbd-help { font-size: 11px; color: var(--color-fg-subtle); display: flex; flex-direction: column; gap: 4px; }
.kbd-help .kb-row { display: flex; justify-content: space-between; }
.kbd-help kbd {
  font-family: var(--font-geist-mono); font-size: 10.5px;
  border: 1px solid var(--color-border); border-bottom-width: 2px;
  border-radius: 3px; padding: 0 5px; color: var(--color-fg-muted); background: var(--color-panel);
}

/* ─── Misc ──────────────────────────────────────────────────────────────── */
.empty {
  padding: 60px 14px; text-align: center; color: var(--color-fg-subtle);
  display: flex; flex-direction: column; gap: 8px; align-items: center;
}
.empty .glyph {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--color-bg-2); display: grid; place-items: center;
}
.dim { color: var(--color-fg-subtle); }
.view-enter { animation: viewIn 140ms ease-out; }
@keyframes viewIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }

/* Language dot colors */
.dot-TypeScript { background: #3178c6; }
.dot-JavaScript { background: #f1e05a; }
.dot-Python { background: #3572A5; }
.dot-Rust { background: #dea584; }
.dot-Go { background: #00ADD8; }
.dot-Elixir { background: #6e4a7e; }
.dot-Java { background: #b07219; }
.dot-Kotlin { background: #A97BFF; }
.dot-Ruby { background: #701516; }
.dot-Swift { background: #F05138; }
.dot-Cpp { background: #f34b7d; }
.dot-Scala { background: #c22d40; }
```

- [ ] **Step 2: Rewrite `web/src/app/layout.tsx`**

Add Geist font, replace the layout with a full-viewport app shell. The topbar is extracted to its own component (created next step).

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Talent Scout",
  description: "GitHub fork profiler CRM for willchen96/mike",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body style={{ fontFamily: "var(--font-geist)" }}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `web/src/components/topbar.tsx`**

Server component. Reads pipeline stats from Prisma. Shows on both list and detail pages.

```tsx
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type Props = {
  candidateLogin?: string;
};

export async function Topbar({ candidateLogin }: Props) {
  const [candidates, enriched, analyzed] = await Promise.all([
    prisma.candidate.count(),
    prisma.repo.findMany({ select: { candidateLogin: true }, distinct: ["candidateLogin"] }).then(r => r.length),
    prisma.profile.count(),
  ]);

  return (
    <div className="topbar">
      <div className="logo">
        <div className="logo-mark">T</div>
        <span>Talent Scout</span>
      </div>
      <span className="crumb">
        / <Link href="/">willchen96/mike</Link>
        {candidateLogin && (
          <> / <span style={{ color: "var(--color-fg-muted)" }}>@{candidateLogin}</span></>
        )}
      </span>
      <div className="spacer" />
      <div className="meta">
        <span className="live-pill">
          <span className="live-dot" />
          Pipeline ready
        </span>
        <span>{candidates} forkers · {enriched} enriched · {analyzed} analyzed</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds. The topbar won't render yet (no page uses it), but layout and CSS compile.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/globals.css web/src/app/layout.tsx web/src/components/topbar.tsx
git commit -m "feat: design system foundation — tokens, Geist font, topbar"
```

---

## Task 2: Shared UI Atoms

**Files:**
- Create: `web/src/components/avatar.tsx`
- Create: `web/src/components/atoms.tsx`
- Delete: `web/src/components/status-pill.tsx`

- [ ] **Step 1: Create `web/src/components/avatar.tsx`**

Initials-on-color fallback with real image support.

```tsx
const AV_BG = [
  "#e06c75", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#98c379",
  "#d19a66", "#be5046", "#7ec8e3", "#c9a0dc", "#4ec9b0", "#d4a373",
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getInitials(name: string | null, login: string): string {
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return login.slice(0, 2).toUpperCase();
}

type AvatarProps = {
  name: string | null;
  login: string;
  avatarUrl: string | null;
  size?: number;
};

export function Avatar({ name, login, avatarUrl, size = 22 }: AvatarProps) {
  const bg = AV_BG[hashCode(login) % AV_BG.length];
  const initials = getInitials(name, login);

  return (
    <div className="av" style={{ "--av-size": `${size}px`, background: bg } as React.CSSProperties}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={login} />
      ) : (
        initials
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `web/src/components/atoms.tsx`**

All small shared atoms: StatusPill, FitChip, FitDots, LangBadge, fmtNum, relTime.

```tsx
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`st-pill st-${status}`}>
      <span className="dot" />
      <span>{status[0].toUpperCase() + status.slice(1)}</span>
    </span>
  );
}

export function FitChip({ score }: { score: number }) {
  return (
    <span className={`fit-chip fit-${score}`}>
      {score}<span style={{ opacity: 0.55, marginLeft: 1, fontWeight: 500 }}>/5</span>
    </span>
  );
}

export function FitDots({ score }: { score: number }) {
  return (
    <span className="fit-dots" data-tier={score}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`d${i <= score ? " on" : ""}`} />
      ))}
    </span>
  );
}

export function LangBadge({ name }: { name: string }) {
  const dotClass = `dot dot-${name.replace("+", "p")}`;
  return (
    <span className="lang">
      <span className={dotClass} />
      <span>{name}</span>
    </span>
  );
}

export function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function relTime(iso: string | Date | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + "mo ago";
  return Math.floor(mo / 12) + "y ago";
}
```

- [ ] **Step 3: Delete `web/src/components/status-pill.tsx`**

Run: `rm web/src/components/status-pill.tsx`

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build will fail because existing pages import the old `status-pill.tsx`. That's expected — we'll fix those in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/avatar.tsx web/src/components/atoms.tsx
git rm web/src/components/status-pill.tsx
git commit -m "feat: shared UI atoms — avatar, status pill, fit chip, lang badge"
```

---

## Task 3: Filter Bar + URL Params

**Files:**
- Modify: `web/src/lib/filters.ts`
- Rewrite: `web/src/components/filter-bar.tsx`

- [ ] **Step 1: Update `web/src/lib/filters.ts`**

Update param names to match the design (`minFit` instead of `fitMin`, `hasCommits` instead of `hasOwnCommits`, expanded sort values).

```typescript
export function buildWhere(params: Record<string, string | undefined>) {
  const where: Record<string, unknown> = {};
  const { status, seniority, minFit, hasCommits, language, q } = params;

  if (status && status !== "all") where.crm = { status };
  if (seniority && seniority !== "all") where.profile = { ...((where.profile as object) ?? {}), seniority };
  if (minFit && parseInt(minFit) > 0) {
    where.profile = {
      ...((where.profile as object) ?? {}),
      fitScore: { gte: parseInt(minFit) },
    };
  }
  if (hasCommits === "true") where.forkMeta = { hasOwnCommits: true };
  if (language && language !== "all") where.repos = { some: { language } };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { bio: { contains: q } },
      { login: { contains: q } },
      { location: { contains: q } },
    ];
  }
  return where;
}

export function buildOrderBy(sort?: string) {
  switch (sort) {
    case "fit-asc":
      return { profile: { fitScore: "asc" as const } };
    case "followers-desc":
      return { followers: "desc" as const };
    case "repos-desc":
      return { publicRepos: "desc" as const };
    case "fetched-desc":
      return { fetchedAt: "desc" as const };
    case "name-asc":
      return { name: "asc" as const };
    case "fit-desc":
    default:
      return { profile: { fitScore: "desc" as const } };
  }
}
```

- [ ] **Step 2: Rewrite `web/src/components/filter-bar.tsx`**

Complete rewrite with custom filter popovers (no shadcn Select), search with `<kbd>/</kbd>` hint, toggle pill, sort button, and URL param sync.

```tsx
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
  { value: "fetched-desc", label: "Recently fetched" },
  { value: "name-asc", label: "Name (A–Z)" },
];

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

  // Global / shortcut
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
      <div className="search">
        <span style={{ color: "var(--color-fg-subtle)" }}>⌕</span>
        <input ref={searchRef} type="text" placeholder="Search name, login, bio…"
          defaultValue={get("q", "")} onChange={e => setQ(e.target.value)} />
        <kbd>/</kbd>
      </div>
      <FilterPopover label="Status" value={get("status", "all")} options={STATUS_OPTS} onChange={v => set("status", v)} />
      <FilterPopover label="Seniority" value={get("seniority", "all")} options={SENIORITY_OPTS} onChange={v => set("seniority", v)} />
      <FilterPopover label="Fit" value={get("minFit", "0")} options={FIT_OPTS} onChange={v => set("minFit", v)} />
      <FilterPopover label="Lang" value={get("language", "all")} options={LANG_OPTS} onChange={v => set("language", v)} />
      <button className="toggle-pill" data-on={hasCommits || undefined}
        onClick={() => set("hasCommits", hasCommits ? "" : "true")}>
        <span className="check-box">{hasCommits && <span style={{ fontSize: 9 }}>✓</span>}</span>
        Own commits
      </button>
      <div className="right">
        <FilterPopover label="Sort" value={get("sort", "fit-desc")} options={SORT_OPTS}
          onChange={v => set("sort", v)} align="right" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/filters.ts web/src/components/filter-bar.tsx
git commit -m "feat: filter bar with custom popovers and updated URL params"
```

---

## Task 4: List Page

**Files:**
- Rewrite: `web/src/components/candidate-row.tsx`
- Create: `web/src/components/meta-strip.tsx`
- Create: `web/src/components/list-keyboard-nav.tsx`
- Rewrite: `web/src/app/page.tsx`

- [ ] **Step 1: Create `web/src/components/meta-strip.tsx`**

Server component showing filtered/total counts and status breakdown.

```tsx
type Props = {
  filtered: number;
  total: number;
  avgFit: string;
  ownCommitsForks: number;
  byStatus: Record<string, number>;
};

export function MetaStrip({ filtered, total, avgFit, ownCommitsForks, byStatus }: Props) {
  return (
    <div className="metastrip">
      <span><b>{filtered}</b> of <b>{total}</b> candidates</span>
      <span>Avg fit <b>{avgFit}</b></span>
      <span>Own-commits forks <b>{ownCommitsForks}</b></span>
      <span style={{ flex: 1 }} />
      <span>
        <b>{byStatus.new ?? 0}</b> new · <b>{byStatus.reviewing ?? 0}</b> reviewing ·{" "}
        <b>{byStatus.interested ?? 0}</b> interested · <b>{byStatus.contacted ?? 0}</b> contacted ·{" "}
        <b>{byStatus.passed ?? 0}</b> passed · <b>{byStatus.hired ?? 0}</b> hired
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/components/candidate-row.tsx`**

9-column CSS grid row, 36px ultra-dense.

```tsx
import { Avatar } from "./avatar";
import { StatusPill, FitChip, LangBadge, fmtNum } from "./atoms";

type Props = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; status: string; topLanguages: string[];
  followers: number; publicRepos: number;
  hasOwnCommits: boolean; aheadBy: number;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
};

export function CandidateRow({
  login, name, avatarUrl, location, summary, fitScore, status,
  topLanguages, followers, publicRepos, hasOwnCommits, aheadBy,
  isActive, onClick, onMouseEnter,
}: Props) {
  return (
    <div className="row" data-active={isActive || undefined}
      onClick={onClick} onMouseEnter={onMouseEnter}>
      <div className="who">
        <Avatar name={name} login={login} avatarUrl={avatarUrl} size={22} />
        <div className="who-stack">
          <div className="name">
            {name || login} <span className="login">@{login}</span>
          </div>
        </div>
      </div>
      <div className="fit-cell">
        {fitScore != null ? <FitChip score={fitScore} /> : <span className="dim">—</span>}
      </div>
      <div className="summary" title={summary ?? undefined}>{summary || <span className="dim">—</span>}</div>
      <div className="loc">{location || <span className="dim">—</span>}</div>
      <div className="langs">
        {topLanguages.slice(0, 3).map(l => <LangBadge key={l} name={l} />)}
      </div>
      <div className="nums">{fmtNum(followers)}</div>
      <div className="nums">{publicRepos}</div>
      <div className="stat">
        {hasOwnCommits ? (
          <span className="commit-flag"><span className="glyph">●</span> +{aheadBy}</span>
        ) : (
          <span className="dim" style={{ fontSize: 11.5 }}>clone</span>
        )}
      </div>
      <div className="stat"><StatusPill status={status} /></div>
    </div>
  );
}
```

- [ ] **Step 3: Create `web/src/components/list-keyboard-nav.tsx`**

Client wrapper that handles j/k/enter keyboard navigation and renders the column header + scrollable row area.

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type CandidateRef = { login: string };

export function ListKeyboardNav({
  candidates,
  children,
  sort,
}: {
  candidates: CandidateRef[];
  children: (activeIdx: number, setActiveIdx: (i: number) => void) => React.ReactNode;
  sort: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => { setActiveIdx(0); }, [candidates.length, sort]);

  useEffect(() => {
    if (activeIdx >= candidates.length) setActiveIdx(Math.max(0, candidates.length - 1));
  }, [candidates.length, activeIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(candidates.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = candidates[activeIdx];
        if (c) router.push(`/candidates/${c.login}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [candidates, activeIdx, router]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!el || !scrollRef.current) return;
    const er = el.getBoundingClientRect();
    const pr = scrollRef.current.getBoundingClientRect();
    if (er.top < pr.top + 40) scrollRef.current.scrollTop -= (pr.top + 40 - er.top);
    else if (er.bottom > pr.bottom - 8) scrollRef.current.scrollTop += (er.bottom - pr.bottom + 8);
  }, [activeIdx]);

  const cols = "minmax(220px, 1.4fr) 90px minmax(280px, 2.4fr) minmax(140px, 1.1fr) 168px 70px 70px 90px 110px";

  return (
    <div style={{ "--cols": cols } as React.CSSProperties}>
      <div className="row-head">
        <div>Candidate</div>
        <div>Fit</div>
        <div>Summary</div>
        <div>Location</div>
        <div>Languages</div>
        <div style={{ textAlign: "right" }}>Followers</div>
        <div style={{ textAlign: "right" }}>Repos</div>
        <div>Fork</div>
        <div>Status</div>
      </div>
      <div className="list-scroll" ref={scrollRef}>
        {children(activeIdx, setActiveIdx)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/src/app/page.tsx`**

Expanded Prisma query, meta strip, and wired-up keyboard navigation.

```tsx
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { buildWhere, buildOrderBy } from "@/lib/filters";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { MetaStrip } from "@/components/meta-strip";
import { CandidateList } from "@/components/candidate-list";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Home({ searchParams }: Props) {
  const params = await searchParams;
  const where = buildWhere(params);
  const orderBy = buildOrderBy(params.sort);

  const [candidates, allCandidates] = await Promise.all([
    prisma.candidate.findMany({
      where: where as any,
      orderBy: orderBy as any,
      take: 200,
      include: {
        profile: { select: { summary: true, fitScore: true, seniority: true } },
        crm: { select: { status: true } },
        repos: { select: { language: true }, take: 20 },
        forkMeta: { select: { hasOwnCommits: true, aheadBy: true } },
      },
    }),
    prisma.candidate.findMany({
      select: {
        profile: { select: { fitScore: true } },
        crm: { select: { status: true } },
        forkMeta: { select: { hasOwnCommits: true } },
      },
    }),
  ]);

  const total = allCandidates.length;
  const avgFit = total > 0
    ? (allCandidates.reduce((s, c) => s + (c.profile?.fitScore ?? 0), 0) / total).toFixed(2)
    : "0";
  const ownCommitsForks = allCandidates.filter(c => c.forkMeta?.hasOwnCommits).length;
  const byStatus: Record<string, number> = {};
  allCandidates.forEach(c => {
    const st = c.crm?.status ?? "new";
    byStatus[st] = (byStatus[st] ?? 0) + 1;
  });

  const rows = candidates.map(c => ({
    login: c.login,
    name: c.name,
    avatarUrl: c.avatarUrl,
    location: c.location,
    summary: c.profile?.summary ?? null,
    fitScore: c.profile?.fitScore ?? null,
    status: c.crm?.status ?? "new",
    topLanguages: [...new Set(c.repos.map(r => r.language).filter(Boolean))] as string[],
    followers: c.followers,
    publicRepos: c.publicRepos,
    hasOwnCommits: c.forkMeta?.hasOwnCommits ?? false,
    aheadBy: c.forkMeta?.aheadBy ?? 0,
  }));

  return (
    <div className="app-shell">
      <Topbar />
      <div className="list-page view-enter">
        <Suspense><FilterBar /></Suspense>
        <MetaStrip filtered={rows.length} total={total} avgFit={avgFit}
          ownCommitsForks={ownCommitsForks} byStatus={byStatus} />
        <CandidateList candidates={rows} sort={params.sort ?? "fit-desc"} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `web/src/components/candidate-list.tsx`**

Client component that wraps keyboard nav + renders rows. Needs to be a client component because `ListKeyboardNav` manages state.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { CandidateRow } from "./candidate-row";
import { ListKeyboardNav } from "./list-keyboard-nav";

type CandidateData = {
  login: string; name: string | null; avatarUrl: string | null;
  location: string | null; summary: string | null;
  fitScore: number | null; status: string; topLanguages: string[];
  followers: number; publicRepos: number;
  hasOwnCommits: boolean; aheadBy: number;
};

export function CandidateList({ candidates, sort }: { candidates: CandidateData[]; sort: string }) {
  const router = useRouter();

  if (candidates.length === 0) {
    return (
      <div className="empty">
        <div className="glyph">∅</div>
        <div>No candidates match these filters.</div>
        <button className="tb-link" style={{ marginTop: 4 }} onClick={() => router.push("/")}>
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <ListKeyboardNav candidates={candidates} sort={sort}>
      {(activeIdx, setActiveIdx) =>
        candidates.map((c, i) => (
          <CandidateRow key={c.login} {...c}
            isActive={i === activeIdx}
            onClick={() => router.push(`/candidates/${c.login}`)}
            onMouseEnter={() => setActiveIdx(i)} />
        ))
      }
    </ListKeyboardNav>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web/src/
git commit -m "feat: list page — dense grid rows, meta strip, keyboard nav"
```

---

## Task 5: Detail Page — Main Content

**Files:**
- Create: `web/src/components/assessment-card.tsx`
- Rewrite: `web/src/components/signal-list.tsx`
- Create: `web/src/components/linkedin-block.tsx`
- Rewrite: `web/src/components/repo-card.tsx`
- Create: `web/src/components/web-mention.tsx`
- Create: `web/src/components/activity-list.tsx`

- [ ] **Step 1: Create `web/src/components/assessment-card.tsx`**

```tsx
import { FitDots } from "./atoms";
import { relTime } from "./atoms";

type Props = {
  fitScore: number;
  seniority: string | null;
  confidence: number | null;
  model: string | null;
  generatedAt: Date | null;
  summary: string | null;
  fitReasoning: string | null;
  recommendedOutreach: string | null;
  outreachReason: string | null;
};

export function AssessmentCard({
  fitScore, seniority, confidence, model, generatedAt,
  summary, fitReasoning, recommendedOutreach, outreachReason,
}: Props) {
  const confPct = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="assess">
      <div className="fit-lg">
        <div className="fit-lbl">Fit</div>
        <div className="fit-num">{fitScore}<span className="of">/5</span></div>
        <FitDots score={fitScore} />
      </div>
      <div className="body">
        <div className="h">
          {seniority && <span className="sen-badge">{seniority}</span>}
          {confPct != null && (
            <span className="conf">
              Confidence
              <span className="bar"><i style={{ width: `${confPct}%` }} /></span>
              {confPct}%
            </span>
          )}
          <span style={{ color: "var(--color-fg-subtle)", fontSize: 11 }}>
            · {model} · generated {relTime(generatedAt)}
          </span>
        </div>
        {summary && <div className="summary">{summary}</div>}
        {fitReasoning && <div className="reasoning">{fitReasoning}</div>}
        {recommendedOutreach && (
          <div className="outreach">
            <span className={`verdict verdict-${recommendedOutreach}`}>
              Outreach: {recommendedOutreach}
            </span>
            {outreachReason && <span style={{ color: "var(--color-fg-muted)", lineHeight: 1.5 }}>{outreachReason}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/components/signal-list.tsx`**

Grouped by kind with sub-labels and icon circles.

```tsx
type Signal = { kind: string; text: string };

function SubLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, textTransform: "uppercase" as const,
      letterSpacing: "0.06em", color, marginBottom: 6,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}

export function SignalList({ signals }: { signals: Signal[] }) {
  const positives = signals.filter(s => s.kind === "positive");
  const negatives = signals.filter(s => s.kind === "negative");
  const notables = signals.filter(s => s.kind === "notable");

  if (positives.length + negatives.length + notables.length === 0) {
    return <div className="dim" style={{ fontSize: 12.5 }}>No signals extracted.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {positives.length > 0 && (
        <div>
          <SubLabel label="Positive" color="#16a34a" />
          <div className="signal-grid">
            {positives.map((s, i) => (
              <div key={i} className="signal" data-kind="positive">
                <span className="ico">+</span>
                <span className="text">{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {negatives.length > 0 && (
        <div>
          <SubLabel label="Negative" color="#dc2626" />
          <div className="signal-grid">
            {negatives.map((s, i) => (
              <div key={i} className="signal" data-kind="negative">
                <span className="ico">−</span>
                <span className="text">{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {notables.length > 0 && (
        <div>
          <SubLabel label="Notable" color="#2563eb" />
          <div className="signal-grid">
            {notables.map((s, i) => (
              <div key={i} className="signal" data-kind="notable">
                <span className="ico">·</span>
                <span className="text">{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `web/src/components/linkedin-block.tsx`**

```tsx
import { LangBadge } from "./atoms";

type LinkedInData = {
  headline: string | null;
  connectionCount: number | null;
  experience: string | null;
  education: string | null;
  skills: string | null;
};

export function LinkedInBlock({ li }: { li: LinkedInData }) {
  const experience = li.experience ? JSON.parse(li.experience) : [];
  const education = li.education ? JSON.parse(li.education) : [];
  const skills = li.skills ? JSON.parse(li.skills) : [];

  return (
    <div className="li-block">
      <div className="li-head">
        <div className="li-mark">in</div>
        <div className="li-headline">{li.headline}</div>
        {li.connectionCount != null && (
          <div className="li-conn">{li.connectionCount} connections</div>
        )}
      </div>
      <div className="li-body">
        {experience.length > 0 && (
          <>
            <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>
              Experience
            </div>
            <div className="timeline">
              {experience.map((r: any, i: number) => (
                <div key={i} className="role">
                  <div className="marker">{(r.company || "?")[0]}</div>
                  <div>
                    <div className="title">{r.title}</div>
                    <div className="company">{r.company}</div>
                    {r.description && <div className="descr">{r.description}</div>}
                  </div>
                  <div className="dates">{r.duration || ""}</div>
                </div>
              ))}
            </div>
          </>
        )}
        {(education.length > 0 || skills.length > 0) && (
          <div className="li-sub">
            {education.length > 0 && (
              <div>
                <h4>Education</h4>
                {education.map((e: any, i: number) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="school">{e.school}</div>
                    {e.degree && <div className="deg">{e.degree} {e.field || ""}</div>}
                    {e.years && <div className="yrs">{e.years}</div>}
                  </div>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <h4>Skills (LinkedIn)</h4>
                <div className="tags-cloud">
                  {skills.map((s: string) => <span key={s} className="tag">{s}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/src/components/repo-card.tsx`**

```tsx
import { LangBadge, fmtNum, relTime } from "./atoms";

type Props = {
  name: string; htmlUrl: string; description: string | null;
  language: string | null; stars: number; forks: number;
  isFork: boolean; pushedAt: Date | null;
};

export function RepoCard({ name, htmlUrl, description, language, stars, forks, isFork, pushedAt }: Props) {
  return (
    <div className="repo">
      <div>
        <a className="r-name" href={htmlUrl} target="_blank" rel="noopener noreferrer">
          {name}
          {isFork && <span className="r-fork-flag">fork</span>}
        </a>
        <div className="r-descr">{description || <span className="dim">No description</span>}</div>
      </div>
      <div className="r-meta" style={{ alignSelf: "flex-start" }}>
        {language && <LangBadge name={language} />}
        <span className="item">★ {fmtNum(stars)}</span>
        <span className="item">⑂ {forks}</span>
        <span className="item dim">{relTime(pushedAt)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `web/src/components/web-mention.tsx`**

```tsx
type Props = {
  url: string; title: string | null; snippet: string | null; source: string;
};

export function WebMention({ url, title, snippet, source }: Props) {
  return (
    <div className="web">
      <div className="src" data-s={source}>{source.replace("_", " ")}</div>
      <div className="body">
        <a className="t" href={url} target="_blank" rel="noopener noreferrer">{title || url}</a>
        {snippet && <div className="sn">{snippet}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `web/src/components/activity-list.tsx`**

```tsx
import { relTime } from "./atoms";

type Event = { id: number; type: string; repoName: string | null; createdAt: Date };

export function ActivityList({ events }: { events: Event[] }) {
  return (
    <div className="act-list">
      {events.map(e => (
        <div key={e.id} className="act">
          <span className="when">{relTime(e.createdAt)}</span>
          <span className="ev">{e.type.replace("Event", "")}</span>
          <span className="repo-n">{e.repoName || ""}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add web/src/components/
git commit -m "feat: detail page components — assessment, signals, LinkedIn, repos, web, activity"
```

---

## Task 6: CRM Aside + Detail Page Assembly

**Files:**
- Rewrite: `web/src/components/crm-panel.tsx`
- Rewrite: `web/src/app/candidates/[login]/page.tsx`

- [ ] **Step 1: Rewrite `web/src/components/crm-panel.tsx`**

Full CRM aside with saving indicator, snapshot stats, fork info, and keyboard help.

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { updateCrm } from "@/app/candidates/[login]/actions";
import { fmtNum } from "./atoms";

type Props = {
  login: string;
  status: string;
  notes: string | null;
  tags: string | null;
  fitScore: number | null;
  recommendedOutreach: string | null;
  confidence: number | null;
  model: string | null;
  followers: number;
  publicRepos: number;
  githubCreatedAt: Date | null;
  hasOwnCommits: boolean;
  aheadBy: number;
  behindBy: number;
  forkPushedAt: Date | null;
};

export function CrmPanel({
  login, status: initStatus, notes: initNotes, tags: initTags,
  fitScore, recommendedOutreach, confidence, model,
  followers, publicRepos, githubCreatedAt,
  hasOwnCommits, aheadBy, behindBy, forkPushedAt,
}: Props) {
  const [status, setStatus] = useState(initStatus);
  const [notes, setNotes] = useState(initNotes ?? "");
  const [tagInput, setTagInput] = useState(initTags ?? "");
  const [saving, setSaving] = useState<null | "saving" | "saved">(null);
  const debRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setStatus(initStatus);
    setNotes(initNotes ?? "");
    setTagInput(initTags ?? "");
    setSaving(null);
  }, [login, initStatus, initNotes, initTags]);

  const flash = () => {
    setSaving("saving");
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 420);
  };

  const handleStatus = (v: string) => {
    setStatus(v);
    updateCrm(login, { status: v });
    flash();
  };
  const handleNotes = (v: string) => {
    setNotes(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      updateCrm(login, { notes: v });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };
  const handleTags = (v: string) => {
    setTagInput(v);
    clearTimeout(debRef.current);
    setSaving("saving");
    debRef.current = setTimeout(() => {
      updateCrm(login, { tags: v });
      setSaving("saved");
      setTimeout(() => setSaving(null), 1400);
    }, 600);
  };

  const acctAge = githubCreatedAt
    ? Math.floor((Date.now() - new Date(githubCreatedAt).getTime()) / (365 * 24 * 3600 * 1000))
    : null;

  const savingEl = saving === "saving"
    ? <span className="saving">Saving…</span>
    : saving === "saved"
    ? <span className="saving ok">✓ Saved</span>
    : null;

  const savedTags = tagInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <div className="aside">
      <div>
        <h3>CRM</h3>
        <div className="field">
          <label>Status {savingEl}</label>
          <select value={status} onChange={e => handleStatus(e.target.value)}>
            {["new", "reviewing", "interested", "contacted", "passed", "hired"].map(s => (
              <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea placeholder="Add a note — autosaves." value={notes} onChange={e => handleNotes(e.target.value)} />
      </div>

      <div className="field">
        <label>Tags <span className="dim" style={{ fontSize: 10.5 }}>comma-separated</span></label>
        <input type="text" placeholder="q2-batch, warm-intro" value={tagInput} onChange={e => handleTags(e.target.value)} />
        {savedTags.length > 0 && (
          <div className="tags-cloud" style={{ marginTop: 4 }}>
            {savedTags.map(t => <span key={t} className="tag">{t}</span>)}
          </div>
        )}
      </div>

      <div>
        <h3>Snapshot</h3>
        <div className="qstats">
          <div className="qs">
            <div className="k">Fit</div>
            <div className="v">{fitScore ?? "—"}/5</div>
            <div className="sub">{recommendedOutreach ?? "—"}</div>
          </div>
          <div className="qs">
            <div className="k">Confidence</div>
            <div className="v">{confidence != null ? Math.round(confidence * 100) + "%" : "—"}</div>
            <div className="sub">{model ?? "—"}</div>
          </div>
          <div className="qs">
            <div className="k">Followers</div>
            <div className="v">{fmtNum(followers)}</div>
            <div className="sub">{publicRepos} repos</div>
          </div>
          <div className="qs">
            <div className="k">Account</div>
            <div className="v">{acctAge != null ? acctAge + "y" : "—"}</div>
            <div className="sub">on GitHub</div>
          </div>
        </div>
      </div>

      <div>
        <h3>Fork</h3>
        <div style={{ fontSize: 12.5, color: "var(--color-fg-muted)", lineHeight: 1.55 }}>
          {hasOwnCommits ? (
            <>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>● Own commits</span>{" "}
              <span style={{ color: "var(--color-fg-subtle)" }}>·</span>{" "}
              <span>{aheadBy} ahead, {behindBy} behind</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--color-fg-subtle)" }}>○ Clone only</span>{" "}
              <span style={{ color: "var(--color-fg-subtle)" }}>·</span>{" "}
              <span>{behindBy} behind</span>
            </>
          )}
        </div>
      </div>

      <div>
        <h3>Keyboard</h3>
        <div className="kbd-help">
          <div className="kb-row"><span>Back to list</span><kbd>Esc</kbd></div>
          <div className="kb-row"><span>Next / prev</span><kbd>J</kbd><kbd>K</kbd></div>
          <div className="kb-row"><span>Focus search</span><kbd>/</kbd></div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `web/src/app/candidates/[login]/page.tsx`**

Full detail page with two-column grid layout, all design sections, and keyboard nav.

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/atoms";
import { AssessmentCard } from "@/components/assessment-card";
import { SignalList } from "@/components/signal-list";
import { LinkedInBlock } from "@/components/linkedin-block";
import { RepoCard } from "@/components/repo-card";
import { WebMention } from "@/components/web-mention";
import { ActivityList } from "@/components/activity-list";
import { CrmPanel } from "@/components/crm-panel";
import { DetailNav } from "@/components/detail-nav";
import { MapPin, Building2, Github, Globe, Twitter, Linkedin } from "lucide-react";

type Props = { params: Promise<{ login: string }> };

export default async function CandidatePage({ params }: Props) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { login },
    include: {
      profile: true, forkMeta: true, signals: true, skills: true,
      repos: { orderBy: { stars: "desc" }, take: 10 },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      crm: true, linkedIn: true,
      webMentions: { orderBy: { scrapedAt: "desc" }, take: 10 },
    },
  });

  if (!candidate) notFound();
  const { profile, forkMeta, signals, skills, repos, events, crm, linkedIn, webMentions } = candidate;

  return (
    <div className="app-shell">
      <Topbar candidateLogin={login} />
      <DetailNav login={login}>
        <div className="detail-grid view-enter">
          <main className="detail-main">
            <div className="dx">
              {/* Header */}
              <header className="detail-header">
                <Avatar name={candidate.name} login={login} avatarUrl={candidate.avatarUrl} size={62} />
                <div className="h-meta">
                  <div className="h-name">
                    <h1>{candidate.name || login}</h1>
                    <span className="login">@{login}</span>
                    <StatusPill status={crm?.status ?? "new"} />
                  </div>
                  {candidate.bio && <p className="h-bio">{candidate.bio}</p>}
                  <div className="h-row">
                    {candidate.location && <span><MapPin size={14} /> {candidate.location}</span>}
                    {candidate.company && <><span className="dotsep">·</span><span><Building2 size={14} /> {candidate.company}</span></>}
                    <span className="dotsep">·</span>
                    <a href={candidate.htmlUrl ?? `https://github.com/${login}`} target="_blank" rel="noopener noreferrer">
                      <Github size={14} /> github.com/{login}
                    </a>
                    {candidate.blog && <><span className="dotsep">·</span><a href={candidate.blog} target="_blank" rel="noopener noreferrer"><Globe size={14} /> {candidate.blog.replace("https://", "")}</a></>}
                    {candidate.twitter && <><span className="dotsep">·</span><span><Twitter size={14} /> @{candidate.twitter}</span></>}
                    {linkedIn?.profileUrl && <><span className="dotsep">·</span><a href={linkedIn.profileUrl} target="_blank" rel="noopener noreferrer"><Linkedin size={14} /> LinkedIn</a></>}
                  </div>
                </div>
              </header>

              {/* Assessment */}
              {profile && (
                <AssessmentCard fitScore={profile.fitScore ?? 0} seniority={profile.seniority}
                  confidence={profile.confidence} model={profile.model}
                  generatedAt={profile.generatedAt} summary={profile.summary}
                  fitReasoning={profile.fitReasoning}
                  recommendedOutreach={profile.recommendedOutreach}
                  outreachReason={profile.outreachReason} />
              )}

              {/* Signals */}
              <section className="section">
                <div className="section-h">
                  <h2>Signals</h2>
                  <span className="count">
                    {signals.filter(s => s.kind === "positive").length} positive ·{" "}
                    {signals.filter(s => s.kind === "negative").length} negative ·{" "}
                    {signals.filter(s => s.kind === "notable").length} notable
                  </span>
                </div>
                <SignalList signals={signals.map(s => ({ kind: s.kind, text: s.text }))} />
              </section>

              {/* Skills */}
              {skills.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Skills</h2><span className="count">{skills.length}</span></div>
                  <div className="tags-cloud">
                    {skills.map(s => <span key={s.id} className="tag">{s.name}</span>)}
                  </div>
                </section>
              )}

              {/* LinkedIn */}
              {linkedIn?.headline && (
                <section className="section">
                  <div className="section-h">
                    <h2>LinkedIn</h2>
                    {linkedIn.connectionCount != null && <span className="count">{linkedIn.connectionCount} connections</span>}
                  </div>
                  <LinkedInBlock li={linkedIn} />
                </section>
              )}

              {/* Web Presence */}
              {webMentions.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Web Presence</h2><span className="count">{webMentions.length}</span></div>
                  <div className="web-list">
                    {webMentions.map(w => (
                      <WebMention key={w.id} url={w.url} title={w.title} snippet={w.snippet} source={w.source} />
                    ))}
                  </div>
                </section>
              )}

              {/* Repos */}
              {repos.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Top Repos</h2><span className="count">{repos.length}</span></div>
                  <div className="repo-list">
                    {repos.map(r => (
                      <RepoCard key={r.id} name={r.name} htmlUrl={r.htmlUrl} description={r.description}
                        language={r.language} stars={r.stars} forks={r.forks} isFork={r.isFork} pushedAt={r.pushedAt} />
                    ))}
                  </div>
                </section>
              )}

              {/* Activity */}
              {events.length > 0 && (
                <section className="section">
                  <div className="section-h"><h2>Recent Activity</h2><span className="count">{events.length} events</span></div>
                  <ActivityList events={events} />
                </section>
              )}
            </div>
          </main>

          <aside className="detail-aside">
            <CrmPanel login={login}
              status={crm?.status ?? "new"} notes={crm?.notes ?? null} tags={crm?.tags ?? null}
              fitScore={profile?.fitScore ?? null}
              recommendedOutreach={profile?.recommendedOutreach ?? null}
              confidence={profile?.confidence ?? null}
              model={profile?.model ?? null}
              followers={candidate.followers} publicRepos={candidate.publicRepos}
              githubCreatedAt={candidate.githubCreatedAt}
              hasOwnCommits={forkMeta?.hasOwnCommits ?? false}
              aheadBy={forkMeta?.aheadBy ?? 0} behindBy={forkMeta?.behindBy ?? 0}
              forkPushedAt={forkMeta?.forkPushedAt ?? null} />
          </aside>
        </div>
      </DetailNav>
    </div>
  );
}
```

- [ ] **Step 3: Create `web/src/components/detail-nav.tsx`**

Client component for Esc/j/k keyboard navigation on the detail page.

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DetailNav({ login, children }: { login: string; children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Escape") {
        e.preventDefault();
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return <>{children}</>;
}
```

- [ ] **Step 4: Verify build**

Run: `cd web && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: detail page — assessment, signals, LinkedIn, repos, CRM aside"
```

---

## Verification Checklist

After all 6 tasks are complete:

- [ ] **1. Build:** `cd web && npm run build` — zero errors
- [ ] **2. Dev server:** `cd web && npm run dev` → `http://localhost:3000`
- [ ] **3. List page:** Dense 36px grid rows with 9 columns, filter popovers open on click, search has kbd hint, keyboard j/k/enter works, meta strip shows counts
- [ ] **4. Empty state:** Filter to impossible combination → "∅ No candidates match" with "Clear filters" link
- [ ] **5. Detail page:** Click a candidate → assessment card with 44px fit number + dots + confidence bar, signals grouped by kind with colored cards, LinkedIn timeline (if data exists), repos with accent-colored name links, activity with mono event tags, CRM aside with snapshot stats
- [ ] **6. CRM save:** Change status → "Saving…" → "✓ Saved" indicator, notes autosave on debounce, tags show as tag cloud below input
- [ ] **7. Keyboard:** On detail page: Esc goes back to list. On list: / focuses search
- [ ] **8. Topbar:** Logo mark with gradient, breadcrumb shows `/ willchen96/mike / @login` on detail, pipeline stats on right
- [ ] **9. Typography:** Geist font renders (check devtools computed font), 13px base, correct weights
- [ ] **10. Compare to design:** Open `design_handoff_talent_scout/Talent Scout.html` side-by-side with the Next.js app — colors, spacing, density should match
