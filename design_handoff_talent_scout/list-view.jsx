// list-view.jsx — Candidate list with filters, sort, search, keyboard nav.
/* global React */

const { useState, useMemo, useRef, useEffect, useCallback } = React;

// ─── Small atoms ─────────────────────────────────────────────────────────────
function Avatar({ c, size = 22, shape = "rounded" }) {
  const cls = shape === "circle" ? "av av-circle"
    : shape === "square" ? "av av-square"
    : "av av-rounded";
  return (
    <div
      className={cls}
      style={{ "--av-size": size + "px", background: c.avatarBg }}
      aria-hidden="true"
    >
      {c.avatarInit}
    </div>
  );
}

function LangBadge({ name }) {
  const k = (name || "").replace("+", "p");
  return (
    <span className="lang">
      <span className={"dot dot-" + k}></span>
      <span>{name}</span>
    </span>
  );
}

function StatusPill({ status }) {
  return (
    <span className={"pill st-" + status}>
      <span className="dot"></span>
      <span>{status[0].toUpperCase() + status.slice(1)}</span>
    </span>
  );
}

function FitScore({ score, treatment = "chip" }) {
  if (treatment === "dots") {
    return (
      <span className="fit-dots" data-tier={score}>
        {[1,2,3,4,5].map(i => (
          <span key={i} className={"d" + (i <= score ? " on" : "")}></span>
        ))}
      </span>
    );
  }
  if (treatment === "bar") {
    return (
      <span className="fit-bar" data-tier={score}>
        <i style={{ width: (score * 20) + "%" }}></i>
      </span>
    );
  }
  if (treatment === "grade") {
    const grade = ["–", "D", "C", "B", "A", "A+"][score] || "–";
    return <span className="fit-grade" data-tier={score}>{grade}</span>;
  }
  // default: chip
  return <span className={"fit-chip fit-" + score}>{score}<span style={{opacity:.55, marginLeft: 1, fontWeight: 500}}>/5</span></span>;
}

// ─── Filter popover ──────────────────────────────────────────────────────────
function FilterButton({ label, value, options, onChange, allLabel = "All" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const current = options.find(o => o.value === value);
  const isActive = value && value !== "all";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="filter-btn" data-active={isActive} onClick={() => setOpen(!open)}>
        <span className="lbl">{label}:</span>
        <span className="val">{current ? current.label : allLabel}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="pop" style={{ top: "calc(100% + 4px)", left: 0 }}>
          {options.map(o => (
            <div key={o.value}
              className="pop-item"
              data-active={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.swatch && <span className="swatch" style={{ background: o.swatch }}></span>}
              <span>{o.label}</span>
              {o.value === value && <span className="check">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SortButton({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const opts = [
    { v: "fit-desc", lbl: "Fit score (high → low)" },
    { v: "fit-asc",  lbl: "Fit score (low → high)" },
    { v: "followers-desc", lbl: "Followers" },
    { v: "repos-desc", lbl: "Public repos" },
    { v: "fetched-desc", lbl: "Recently fetched" },
    { v: "name-asc", lbl: "Name (A–Z)" },
  ];
  const current = opts.find(o => o.v === value) || opts[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="filter-btn" onClick={() => setOpen(!open)}>
        <span className="lbl">Sort:</span>
        <span className="val">{current.lbl}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="pop" style={{ top: "calc(100% + 4px)", right: 0 }}>
          {opts.map(o => (
            <div key={o.v}
              className="pop-item"
              data-active={o.v === value}
              onClick={() => { onChange(o.v); setOpen(false); }}>
              <span>{o.lbl}</span>
              {o.v === value && <span className="check">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── List view ───────────────────────────────────────────────────────────────
function ListView({ candidates, onOpen, tweaks }) {
  const [filters, setFilters] = useState({
    status: "all",
    seniority: "all",
    minFit: 0,
    hasCommits: false,
    language: "all",
    q: "",
  });
  const [sort, setSort] = useState("fit-desc");
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef(null);
  const searchRef = useRef(null);

  // Filter
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    let out = candidates.filter(c => {
      if (filters.status !== "all" && c.crm.status !== filters.status) return false;
      if (filters.seniority !== "all" && c.profile.seniority !== filters.seniority) return false;
      if (filters.minFit > 0 && (c.profile.fitScore || 0) < filters.minFit) return false;
      if (filters.hasCommits && !c.forkMeta.hasOwnCommits) return false;
      if (filters.language !== "all" && !c.topLanguages.includes(filters.language)) return false;
      if (q) {
        const hay = (c.name + " " + c.login + " " + (c.bio || "") + " " + (c.location || "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Sort
    const cmp = {
      "fit-desc": (a, b) => (b.profile.fitScore - a.profile.fitScore) || (b.followers - a.followers),
      "fit-asc":  (a, b) => (a.profile.fitScore - b.profile.fitScore),
      "followers-desc": (a, b) => b.followers - a.followers,
      "repos-desc": (a, b) => b.publicRepos - a.publicRepos,
      "fetched-desc": (a, b) => new Date(b.profile.generatedAt) - new Date(a.profile.generatedAt),
      "name-asc": (a, b) => a.name.localeCompare(b.name),
    }[sort];
    out = [...out].sort(cmp);
    return out;
  }, [candidates, filters, sort]);

  // Clamp active
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIdx]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const isField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "/" && !isField) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (isField) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const c = filtered[activeIdx];
        if (c) onOpen(c.login);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, activeIdx, onOpen]);

  // Scroll active into view
  useEffect(() => {
    const el = scrollRef.current?.querySelector('[data-active="true"]');
    if (!el) return;
    const parent = scrollRef.current;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    if (er.top < pr.top + 40) parent.scrollTop -= (pr.top + 40 - er.top);
    else if (er.bottom > pr.bottom - 8) parent.scrollTop += (er.bottom - pr.bottom + 8);
  }, [activeIdx]);

  // Counts
  const total = candidates.length;
  const byStatus = useMemo(() => {
    const c = { new: 0, reviewing: 0, interested: 0, contacted: 0, passed: 0, hired: 0 };
    candidates.forEach(x => { c[x.crm.status] = (c[x.crm.status] || 0) + 1; });
    return c;
  }, [candidates]);
  const avgFit = useMemo(
    () => (candidates.reduce((s, x) => s + (x.profile.fitScore || 0), 0) / candidates.length).toFixed(2),
    [candidates]
  );

  // Column template — sized for ultra-dense rows
  const cols = "minmax(220px, 1.4fr) 90px minmax(280px, 2.4fr) minmax(140px, 1.1fr) 168px 70px 70px 90px 110px";

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const rowH = tweaks.density === "ultra" ? 36 : tweaks.density === "roomy" ? 72 : 52;
  const avSize = tweaks.density === "ultra" ? 22 : tweaks.density === "roomy" ? 36 : 28;

  return (
    <div className="list-page view-enter" style={{ "--cols": cols, "--row-h": rowH + "px" }}>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="search">
          <span style={{ color: "var(--fg-subtle)" }}>⌕</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search name, login, bio…"
            value={filters.q}
            onChange={e => setF("q", e.target.value)}
          />
          <kbd>/</kbd>
        </div>
        <FilterButton
          label="Status"
          value={filters.status}
          onChange={v => setF("status", v)}
          options={[
            { value: "all", label: "All" },
            { value: "new", label: "New", swatch: "#8a8e9d" },
            { value: "reviewing", label: "Reviewing", swatch: "#3b82f6" },
            { value: "interested", label: "Interested", swatch: "#8b5cf6" },
            { value: "contacted", label: "Contacted", swatch: "#f59e0b" },
            { value: "passed", label: "Passed", swatch: "#a08879" },
            { value: "hired", label: "Hired", swatch: "#16a34a" },
          ]}
        />
        <FilterButton
          label="Seniority"
          value={filters.seniority}
          onChange={v => setF("seniority", v)}
          options={[
            { value: "all", label: "All" },
            { value: "junior", label: "Junior" },
            { value: "mid", label: "Mid" },
            { value: "senior", label: "Senior" },
            { value: "staff", label: "Staff" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
        <FilterButton
          label="Fit"
          value={String(filters.minFit)}
          onChange={v => setF("minFit", Number(v))}
          options={[
            { value: "0", label: "Any" },
            { value: "5", label: "5 only" },
            { value: "4", label: "4+" },
            { value: "3", label: "3+" },
            { value: "2", label: "2+" },
          ]}
          allLabel="Any"
        />
        <FilterButton
          label="Lang"
          value={filters.language}
          onChange={v => setF("language", v)}
          options={[
            { value: "all", label: "All" },
            ...["TypeScript", "Python", "Rust", "Go", "Elixir", "Java"].map(l => ({ value: l, label: l })),
          ]}
        />
        <button className="toggle-pill" data-on={filters.hasCommits}
                onClick={() => setF("hasCommits", !filters.hasCommits)}>
          <span className="check">{filters.hasCommits && <span style={{fontSize: 9}}>✓</span>}</span>
          Own commits
        </button>
        <div className="right">
          <SortButton value={sort} onChange={setSort} />
          <div className="tb-divider"></div>
          <button className="tb-link">⤓ Export</button>
        </div>
      </div>

      {/* Meta strip */}
      <div className="metastrip">
        <span className="count"><b>{filtered.length}</b> of <b>{total}</b> candidates</span>
        <span className="count">Avg fit <b>{avgFit}</b></span>
        <span className="count">Own-commits forks <b>{candidates.filter(c => c.forkMeta.hasOwnCommits).length}</b></span>
        <span style={{flex: 1}}></span>
        <span className="count">
          <b>{byStatus.new}</b> new · <b>{byStatus.reviewing}</b> reviewing ·{" "}
          <b>{byStatus.interested}</b> interested · <b>{byStatus.contacted}</b> contacted ·{" "}
          <b>{byStatus.passed}</b> passed · <b>{byStatus.hired}</b> hired
        </span>
      </div>

      {/* Column header */}
      <div className="row-head">
        <div>Candidate</div>
        <div className="sortable" data-sorted={sort.startsWith("fit-")}
             onClick={() => setSort(sort === "fit-desc" ? "fit-asc" : "fit-desc")}>
          Fit <span className="arrow">{sort === "fit-asc" ? "↑" : "↓"}</span>
        </div>
        <div>Summary</div>
        <div>Location</div>
        <div>Languages</div>
        <div className="sortable right" data-sorted={sort === "followers-desc"}
             onClick={() => setSort("followers-desc")}>Followers</div>
        <div className="sortable right" data-sorted={sort === "repos-desc"}
             onClick={() => setSort("repos-desc")}>Repos</div>
        <div>Fork</div>
        <div>Status</div>
      </div>

      {/* Rows */}
      <div className="list-scroll" ref={scrollRef}>
        {filtered.length === 0 && (
          <div className="empty">
            <div className="glyph">∅</div>
            <div>No candidates match these filters.</div>
            <button className="tb-link" style={{ marginTop: 4 }}
              onClick={() => setFilters({ status: "all", seniority: "all", minFit: 0, hasCommits: false, language: "all", q: "" })}>
              Clear filters
            </button>
          </div>
        )}
        {filtered.map((c, i) => (
          <div key={c.login}
               className="row"
               data-active={i === activeIdx}
               onClick={() => { setActiveIdx(i); onOpen(c.login); }}
               onMouseEnter={() => setActiveIdx(i)}>
            <div className="who">
              <Avatar c={c} size={avSize} shape={tweaks.avatar} />
              <div className="who-stack">
                <div className="name">
                  {c.name}{" "}
                  <span className="login">@{c.login}</span>
                </div>
                {tweaks.density !== "ultra" && (
                  <div className="meta-line">
                    {c.company || ""}
                    {c.company && (c.linkedin?.currentTitle) && " · "}
                    {c.linkedin?.currentTitle || ""}
                  </div>
                )}
              </div>
            </div>
            <div className="fit"><FitScore score={c.profile.fitScore} treatment={tweaks.fitScore} /></div>
            <div className="summary" title={c.profile.summary}>{c.profile.summary}</div>
            <div className="loc">{c.location || <span className="dim">—</span>}</div>
            <div className="langs">
              {c.topLanguages.slice(0, 3).map(l => <LangBadge key={l} name={l} />)}
            </div>
            <div className="nums">{fmtNum(c.followers)}</div>
            <div className="nums">{c.publicRepos}</div>
            <div className="stat">
              {c.forkMeta.hasOwnCommits ? (
                <span className="commit-flag">
                  <span className="glyph">●</span> +{c.forkMeta.aheadBy}
                </span>
              ) : (
                <span className="dim" style={{fontSize: 11.5}}>clone</span>
              )}
            </div>
            <div className="stat"><StatusPill status={c.crm.status} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtNum(n) {
  if (n >= 10000) return (n / 1000).toFixed(0) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

Object.assign(window, { ListView, Avatar, LangBadge, StatusPill, FitScore, fmtNum });
