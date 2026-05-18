# Handoff: Talent Scout UI

A CRM-style web app for triaging engineering candidates sourced from GitHub. This
bundle is the **UI design reference** for the `web/` Next.js app described in
`docs/superpowers/plans/2026-05-18-talent-scout.md`.

---

## About the design files

The files in this bundle are **design references created in HTML** — a single-file
React/Babel prototype showing intended look, layout, density, color use, and
interaction behavior. **They are not production code to copy directly.**

Your task is to **recreate these designs in the target codebase** —
`web/` (Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui) — using its
established patterns:

- Server components for data fetching (list page reads from Prisma).
- Client components only for interactive bits (filter bar, CRM panel, sort menu,
  keyboard nav).
- shadcn/ui primitives where they exist (`Select`, `Input`, `Textarea`, `Badge`,
  `Button`, `DropdownMenu`, `Popover`, `Tabs`).
- Tailwind v4 utilities + a small set of design tokens in `@theme` (defined
  below).
- URL search params (`?status=...&minFit=...&q=...&sort=...`) are the source of
  truth for filter/sort state — list page reads them in the RSC, filter bar
  writes them via `useRouter`.

The prototype uses a mock 50-candidate dataset; in production this data comes
from Prisma over the SQLite file shared with the Python pipeline.

## Fidelity

**High-fidelity.** Exact colors, typography, spacing, density, and component
shapes are documented below and visible in the HTML. Recreate pixel-perfectly
using the codebase's existing libraries and patterns.

---

## Files in this bundle

| File              | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `Talent Scout.html` | Entry point — open this in a browser to interact with the design.      |
| `app.jsx`         | Root — view routing (list ↔ detail) and CRM-override state.              |
| `list-view.jsx`   | List page (toolbar, filters, sort, keyboard nav, dense table).           |
| `detail-view.jsx` | Detail page (header, assessment, signals, LinkedIn, repos, CRM aside).   |
| `data.js`         | Seeded mock data generator for 50 candidates. **Reference only** — production data comes from Prisma. |
| `app.css`         | All styling, design tokens, theme variants.                              |
| `tweaks-panel.jsx`| Design-tool panel. **Do not port** — for evaluating directions only.     |

To preview: open `Talent Scout.html` in any modern browser. Use the **Tweaks**
toggle in the toolbar to switch between Linear / GitHub / Notion theme variants
or alternate density/fit-score treatments. **Linear theme, ultra density, chip
fit-score, right sidebar are the chosen defaults** — that is what you should
build.

---

## Design tokens

These are the canonical values. They live as CSS custom properties in the
prototype (`app.css` `:root`) — in production declare them inside Tailwind v4's
`@theme` block so they're usable as `bg-bg`, `text-fg-muted`, `border-border`,
etc.

### Colors (Linear theme — primary)

| Token                | Hex          | Usage                                                |
| -------------------- | ------------ | ---------------------------------------------------- |
| `--bg`               | `#fbfbfc`    | App background (under panels)                        |
| `--bg-2`             | `#f5f5f7`    | Subtle fills (toolbar fields, repo cards, qstats)    |
| `--panel`            | `#ffffff`    | Cards, toolbar, sidebar                              |
| `--border`           | `#e8e8ec`    | Default border (rows, cards, dividers)               |
| `--border-strong`    | `#d8d8de`    | Form-control borders, dashed dividers                |
| `--fg`               | `#1a1a1f`    | Primary text                                         |
| `--fg-muted`         | `#5b5b66`    | Secondary text (descriptions, meta)                  |
| `--fg-subtle`        | `#8a8a96`    | Tertiary text (labels, placeholders, hints)          |
| `--accent`           | `#5e6ad2`    | Links, focus rings, selected row tint                |
| `--accent-bg`        | `#eef0fb`    | Active filter button bg, selected row bg             |
| `--row-hover`        | `#f4f5f9`    | Row hover                                            |
| `--row-sel`          | `#eef0fb`    | Keyboard-active / selected row                       |

### Semantic colors

**Fit score (1–5)** — `fit-N` modifier on chip:

| Tier | bg          | fg          |
| ---- | ----------- | ----------- |
| 1    | `#eceff3`   | `#5c6473`   |
| 2    | `#fbecd6`   | `#8a6a1f`   |
| 3    | `#dfeaff`   | `#2d5cb1`   |
| 4    | `#d8efde`   | `#1f7a3e`   |
| 5    | `#c7ecd2`   | `#0f6b32` (+ inset border `#9ad7af`) |

**Status pills** (CRM workflow):

| Status     | bg        | fg        | dot       |
| ---------- | --------- | --------- | --------- |
| new        | `#f1f2f6` | `#4a5060` | `#8a8e9d` |
| reviewing  | `#e6f1ff` | `#245aa6` | `#3b82f6` |
| interested | `#ede5ff` | `#6a3fc2` | `#8b5cf6` |
| contacted  | `#fff0e0` | `#a4581f` | `#f59e0b` |
| passed     | `#f4f0ed` | `#7a6357` | `#a08879` |
| hired      | `#dff5e6` | `#1f7a3e` | `#16a34a` |

**Signal kinds** (detail page):

| Kind     | accent    | bg                                          | border                                       |
| -------- | --------- | ------------------------------------------- | -------------------------------------------- |
| positive | `#16a34a` | `color-mix(in oklab, #16a34a, transparent 95%)` | `color-mix(in oklab, #16a34a, transparent 70%)` |
| negative | `#dc2626` | `…#dc2626, transparent 96%`                 | `…#dc2626, transparent 70%`                  |
| notable  | `#2563eb` | `…#2563eb, transparent 96%`                 | `…#2563eb, transparent 70%`                  |

**Language dots** (GitHub-standard colors):

```
TypeScript #3178c6   Python #3572A5   Rust #dea584   Go #00ADD8
Elixir #6e4a7e       Java #b07219     Kotlin #A97BFF Ruby #701516
Swift #F05138        C++ #f34b7d      Scala #c22d40  JavaScript #f1e05a
```

### Typography

- **Sans:** Geist (Google Fonts), weights 400/500/600/700.
  - Falls back to `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- **Mono:** Geist Mono, for `kbd`, event-type tags in activity timeline.
- Font features: `cv11`, `ss01`, `ss03` enabled on body.
- Body base: `13px / 1.45`, antialiased.

Type scale used:

| Use                                  | Size    | Weight | Notes                                    |
| ------------------------------------ | ------- | ------ | ---------------------------------------- |
| H1 (detail header name)              | 22px    | 600    | `letter-spacing: -0.012em`               |
| Big fit number (assess card)         | 44px    | 700    | `letter-spacing: -0.04em`, tabular nums  |
| Section H2                           | 12px    | 600    | uppercase, `letter-spacing: 0.06em`      |
| List column header                   | 10.5px  | 600    | uppercase, `letter-spacing: 0.04em`      |
| List row text                        | 12.5px  | 500/400| 11.5–12.5px for meta-line / locations    |
| Body / cards                         | 13–13.5px | 400  | `line-height: 1.5–1.55`                  |
| Pills & badges                       | 10.5–11.5px | 500/600 |                                    |
| `kbd`                                | 10.5px  | mono   | 1px border, bottom-width 2px             |

Use `text-wrap: pretty` on long-form copy (bio, summary, reasoning, signal
text, repo description).

### Spacing & radius

| Token       | Value | Usage                                       |
| ----------- | ----- | ------------------------------------------- |
| `--radius`        | 6px   | Default (buttons, cards, fields)      |
| `--radius-sm`     | 4px   | Inline elements, small chips          |
| `--radius-lg`     | 10px  | Large cards (assessment, LinkedIn)    |
| Pill              | 999px | Status pills, lang badges, tags       |

| Surface             | Padding            |
| ------------------- | ------------------ |
| Topbar              | `0 14px`, 44px tall|
| Toolbar             | `8px 14px`         |
| Meta strip          | `6px 14px`         |
| List row            | `0 14px`, height per density (ultra 36 / comfy 52 / roomy 72) |
| List header row     | `0 14px`, 28px tall|
| Detail content (`.dx`) | `22px 28px`, max-width 920px |
| Detail aside        | `20px`, sticky     |
| Card (signal/repo)  | `8–10px / 10–12px` |

Shadows:
- `--shadow-sm`: `0 1px 2px rgba(15, 17, 28, 0.04)`
- `--shadow-md`: `0 4px 12px rgba(15, 17, 28, 0.06), 0 1px 2px rgba(15, 17, 28, 0.04)` — used on filter popovers.

Focus ring (form fields, search): `0 0 0 3px color-mix(in oklab, var(--accent), transparent 88%)`; border darkens to `color-mix(in oklab, var(--accent), transparent 50%)`.

---

## Screens

There are **two screens**: `/` (list) and `/candidates/[login]` (detail). A
persistent **topbar** sits above both.

### Topbar (shared)

44px tall, `border-bottom: 1px solid var(--border)`, `background: var(--panel)`.

Layout (flex row, gap 12px, padding `0 14px`):

```
[Logo mark · "Talent Scout"]  [/ willchen96/mike / @login]  ……  [pill]  [meta count]
```

- **Logo mark**: 18×18, `border-radius: 5px`, gradient `linear-gradient(135deg, var(--accent) 0%, color-mix(in oklab, var(--accent), black 22%) 100%)`, white "T", 11px/700.
- **Crumb**: `/` and `willchen96/mike` link (color `var(--fg-muted)` → `var(--fg)` on hover) ; on detail page append `/ @{login}`.
- **Right meta**: 12px, `var(--fg-subtle)`:
  - Live pill (`bg-2`, 1px border, 2/8 padding, 999px radius) with a 6×6 emerald dot showing pipeline freshness, e.g. "Pipeline ran 2h ago".
  - Forker/enriched/analyzed counts: "912 forkers · 904 enriched · 901 analyzed". Pull real numbers from Prisma counts.

### List page (`/`)

Vertical stack inside `<main>`:

1. **Toolbar** — 8/14 padded, panel bg, border-bottom.
2. **Meta strip** — 6/14 padded, bg = `--bg` (subtly recessed), border-bottom, 11.5px subtle-text.
3. **Column header row** — 28px tall, sticky to top of the scroll container.
4. **Rows scroll** — flex 1, vertical-scroll only.

#### Toolbar

Flex row, gap 6px, wraps. Contains:

- **Search** — 280px wide, `bg-2` field with 1px border, 6px radius, 5/8 padding. Inside: `⌕` glyph (subtle), `<input>` (transparent, no border), and a `<kbd>/</kbd>` hint on the right. Pressing `/` focuses + selects. Filters the list live on name / login / bio / location.
- **Filter buttons** (Status, Seniority, Fit, Lang): white pill button, 1px border, 6px radius, padding `4px 9px`, font 12px.
  - Resting: `lbl` in subtle color, value in fg color, `▾` chevron in subtle.
  - When active (non-default value): `bg = var(--accent-bg)`, `border-color = color-mix(in oklab, var(--accent), transparent 60%)`, `color = var(--accent)`.
  - Click opens a popover positioned below-left (or below-right for Sort), `top: calc(100% + 4px)`, 180px min width, panel bg, 1px border, 8px radius, `--shadow-md`, 4px inner padding.
  - Popover items: 5/8 padding, 4px radius, 12.5px text. Optional 8px swatch dot on the left for status filter. ✓ check on the active item.
- **"Own commits" toggle pill**: outlined pill with a checkbox-style 12×12 box on the left; when on, box is filled with accent and shows a ✓, and the whole pill takes the active filter look.
- **Right side** (`margin-left: auto`): Sort button (same pattern as filter buttons), thin divider, "⤓ Export" link button.

URL params: `status`, `seniority`, `minFit` (integer), `language`, `hasCommits` (bool), `q`, `sort`. All persist via `useRouter().replace`.

#### Filter options

- **Status:** all, new, reviewing, interested, contacted, passed, hired.
- **Seniority:** all, junior, mid, senior, staff, unknown.
- **Fit:** Any (0), 5 only, 4+, 3+, 2+.
- **Lang:** all, TypeScript, Python, Rust, Go, Elixir, Java.
- **Sort:** Fit desc (default), Fit asc, Followers, Repos, Recently fetched, Name A–Z.

#### Meta strip

11.5px, subtle color, flex row with gap 18px. Counters are `<b>` in `--fg`, tabular nums:

```
<b>N</b> of <b>M</b> candidates   Avg fit <b>X.XX</b>   Own-commits forks <b>N</b>   …   <b>N</b> new · <b>N</b> reviewing · …
```

#### Column header

CSS grid, columns:

```
minmax(220px, 1.4fr)  90px  minmax(280px, 2.4fr)  minmax(140px, 1.1fr)  168px  70px  70px  90px  110px
```

Columns: **Candidate · Fit · Summary · Location · Languages · Followers (right) · Repos (right) · Fork · Status**.
Style: 10.5px uppercase, `letter-spacing: 0.04em`, subtle color, 600 weight. Sortable headers have a small `↑/↓` arrow when active and bump to `--fg` color.

#### Row (ultra-density default)

36px tall, 0/14 padded, same grid as the header, 12.5px text. `border-bottom: 1px solid var(--border)`. Hover → `--row-hover`. Keyboard-active (`data-active`) → `--row-sel`.

Cells:

- **Candidate**: avatar (22px, 5px radius "rounded" by default — square or circle via theme) on left, then name (500 weight, fg) + ` @login` in subtle. Comfy/roomy densities add a second meta line: `company · LinkedIn currentTitle`.
- **Fit**: chip — see Fit score treatments below.
- **Summary**: muted text, single line, ellipsized. Use `title=` for hover full text.
- **Location**: subtle, ellipsized. Em-dash if missing.
- **Languages**: pill badges (max 3), each with a colored dot (see Language dots table). Pill style: `bg-2`, 1px border, 999px radius, 11px text, subtle color, 1/6/1/4 padding.
- **Followers**: tabular nums, `fmtNum` (≥10k → "12k", ≥1k → "1.2k", else literal), right-aligned, muted color.
- **Repos**: tabular nums, right-aligned, muted color.
- **Fork**: if `hasOwnCommits` show "● +N" with the dot in emerald `#16a34a` and `+N` in subtle. Otherwise show small subtle "clone".
- **Status**: status pill (see semantic colors).

**Keyboard nav on list:**
- `j` / `↓` → next row (clamp)
- `k` / `↑` → previous row
- `Enter` → open detail for active row
- `/` → focus search (selects current value)
- When focus is in an input/textarea/select, only `/` is handled; other keys pass through.
- Active row auto-scrolls into view with an 8/40px margin.

#### Avatars

Deterministic placeholders: initials (first letter of first + last name) on a colored square. Background cycles through a 12-entry palette. Foreground white at 95% opacity, 600 weight, font size = 45% of square size. Use the **real** `avatarUrl` from Prisma when present and fall back to this initials swatch when not.

#### Fit-score treatments

The default is **chip**; other treatments exist as Tweaks. Build the chip; leave others as a future enhancement.

- **Chip**: inline-flex, min-width 22px, 18px tall, 0/5 padding, 4px radius, 11.5px/600, tabular nums. Renders as e.g. `5/5` with the "/5" at 55% opacity, 500 weight. Background/foreground per fit tier table.

### Detail page (`/candidates/[login]`)

Two-column CSS grid: `1fr 320px` (main left, aside right). Aside has `border-left: 1px solid var(--border)`, panel bg, sticky.

Both sides scroll independently.

Main content (`.dx`): `22px 28px` padding, `max-width: 920px`. Vertical stack of: back/nav bar, header, assessment card, signals, skills, LinkedIn, web presence, repos, activity.

#### Back / nav bar

Above the header. Flex row, space-between.

- Left: subtle link button "← All candidates" → navigate to `/?<persisted-params>`.
- Right: two filter-button-style buttons "↑ Prev" and "Next ↓" — `title` shows the prev/next candidate name. Disabled (or hidden) at list boundaries.

#### Header

Flex row, gap 18px, bottom-bordered, padding-bottom 18px, margin-bottom 18px.

- **Avatar**: 62px, same shape token as list.
- **Right column**:
  - **Name line**: `<h1>` 22/600/-0.012em, then ` @login` in 14px subtle, then a status pill. Flex with baseline alignment, wraps on small.
  - **Bio**: muted, max-width 620px, text-wrap pretty, margin `4px 0 10px`.
  - **Meta row**: 12px subtle, flex row gap 14px, wraps. Items separated by `·` (subtle border-strong color):
    - 📍 `{location}` (when present)
    - 🏢 `{company}` (when present)
    - `github.com/{login}` (link → opens GitHub in new tab)
    - `{blog}` (link, when present)
    - `@{twitter}` (when present)
    - `linkedin.com/in/{login}` (when present)

Replace the leading emojis with Lucide icons (`MapPin`, `Building2`, `Github`, `Globe`, `Twitter`, `Linkedin`) at 14px, subtle color, sitting in a flex row with the text.

#### Assessment card

Grid `88px 1fr`, gap 22px, `bg-2` background, 1px border, `--radius-lg`, padding `16px 18px`. Margin-bottom 24px.

- **Left column** ("Fit"):
  - Tiny uppercase label "Fit" (10.5px/600/0.06em, subtle).
  - Big number: `5` (44px/700/-0.04em) followed by `<span class="of">/5</span>` in 18px/500 subtle.
  - Five-dot indicator (use the **dots** fit treatment): 5×6px dots, 3px gap. Filled dots take the color of the tier (`fit-dots[data-tier=N]`).
- **Right column** ("body"):
  - **Header row** (flex wrap, gap 8px, margin-bottom 6px):
    - Seniority badge: panel bg, 1px border, 4px radius, 10.5px/600 uppercase, 0.05em tracking, muted color, padding `1px 6px`.
    - Confidence: 11px subtle text "Confidence" + a 60×4px bar (`--border` bg, fill = muted color, width = `confidence × 100%`) + percent number.
    - Tail meta: ` · {model} · generated {relTime(generatedAt)}` in 11px subtle.
  - **Summary**: 13.5px/1.55, fg color, text-wrap pretty.
  - **Reasoning**: 12.5px/1.55, muted, margin-top 10px, text-wrap pretty.
  - **Outreach** (top dashed border-strong divider, margin/padding 10/12 top):
    - Verdict pill (verdict-yes / verdict-maybe / verdict-no): 10.5px/600 uppercase, 0.06em tracking, 999px radius, padding `1px 8px`.
      - yes → green `#d8efde` bg / `#1f7a3e` fg
      - maybe → blue `#dfeaff` / `#2d5cb1`
      - no → tan `#f4f0ed` / `#7a6357`
    - Reason text: 12.5px muted, flex-start aligned to the pill.

#### Sections (generic)

Each section: margin-bottom 26px. Header:

```
<section-h>      <— flex, baseline, justify-between
  <h2>UPPERCASE LABEL</h2>     <— 12/600/0.06em uppercase, muted
  <count>123</count>           <— 11.5px subtle, tabular nums
</section-h>                   <— border-bottom on padding-bottom 6px
```

#### Signals

Three grouped sub-sections in order: **Positive → Negative → Notable**. Each
group has a tiny colored sub-label (10.5/600/0.06em uppercase) prefixed by a 6×6
dot in the kind color.

Layout: CSS grid, `repeat(auto-fill, minmax(280px, 1fr))`, gap 8px.

Signal card: grid `14px 1fr`, gap 8px, padding `8px 10px`, 1px border, 6px
radius. Icon circle: 14×14, white text, 10/700 — `+` for positive, `−` for
negative, `·` for notable. Card bg / border tinted with the kind color (see
semantic colors table). Text 12.5/1.45, text-wrap pretty.

#### Skills

Tag cloud — flex wrap, 5px gap. Tag: `bg-2`, 1px border, 999px radius, padding
`2px 8px`, 11.5/500, muted color. Source from `profile.skills` (Claude's
extracted skill list).

#### LinkedIn

Only render when `linkedin` is non-null. Section count text: "N connections".

Card: 1px border, `--radius-lg`, overflow hidden.

- **Header** (flex, gap 10, padding `10px 14px`, bottom border):
  - LinkedIn mark: 18×18, 3px radius, `#0a66c2` bg, white "in" letterform (or use Lucide `Linkedin`).
  - Headline (`linkedin.headline`): 13px/500 fg.
  - Right: connection count in 11.5 subtle.
  - Subtle blue gradient overlay: `linear-gradient(180deg, color-mix(in oklab, #0a66c2, transparent 92%), transparent)`.
- **Body** (padding `14px 16px`):
  - Small uppercase "Experience" label.
  - **Timeline**: each role in a grid `28px 1fr auto`, gap 10, padding 10/0, dashed bottom border (none on last).
    - Marker square: 28×28, `bg-2`, 1px border, 4px radius, single capital letter of the company.
    - Title 13/500 fg, company 12 muted, optional description 12 muted 1.45 line-height pretty wrap.
    - Dates (right): `start–end` (11.5 subtle, tabular nums), with months-to-years remainder underneath in 11 dim ("2.3 yr").
  - **Sub-grid** (top 1px border, top padding 14, grid two columns gap 18):
    - **Education** group: each entry → school (12.5/500/fg), degree (11.5/muted), years (11/subtle).
    - **Skills (LinkedIn)** group: same tag cloud component.

#### Web Presence

Section only when `web.length > 0`. List, gap 8.

Mention card: grid `60px 1fr`, gap 12, padding `10px 12px`, 1px border, 6px
radius.

- **Source label** (left col): 10.5/600 uppercase, 0.05em tracking. Color per
  source:
  - `blog` → `#b2603b`
  - `conference` → `#6a3fc2`
  - `google` → `#245aa6`
  - `github_mentions` → `#1f7a3e`
- **Body**:
  - Title link: 13/500 fg → accent on hover with underline.
  - Snippet: 12/muted/1.45, clamped to 2 lines (`-webkit-line-clamp: 2`).

#### Top Repos

Section count: total repo count.

Repo card: grid `1fr auto`, gap 14, padding `10px 12px`, 1px border, 6px radius.

- Left: repo name link in accent + a small "fork" flag (only if `isFork`) — flag
  is 10.5px/500, `bg-2`/border/3px radius, 0/5 padding, subtle text. Description
  12.5/muted/pretty wrap.
- Right (`align-self: flex-start`): flex row gap 12, 11.5/subtle, tabular nums:
  - Language badge (lang dot + name pill).
  - `★ {fmtNum(stars)}`
  - `⑂ {forks}`
  - Relative pushed date (dim).

Sort top repos by stars desc; show all repos returned (no truncation here — the
pipeline already caps at 10).

#### Recent Activity

Section count: "N events".

Scroll container max-height 280px, vertical scroll only.

Row: grid `90px 110px 1fr`, gap 10, padding `4px 0`, bottom-bordered, 12px.

- **When**: relative time (11.5 subtle, tabular nums).
- **Event tag**: mono font, 10.5/500, `bg-2`/muted, 3px radius, 1/6 padding,
  width = max-content. Strip the trailing `Event` from the type
  (`PushEvent` → `Push`, etc.).
- **Repo name**: muted, ellipsized.

Sort newest first.

#### Detail keyboard

- `Esc` → back to list
- `j` / `↓` → next candidate
- `k` / `↑` → previous candidate

Same input-focus exclusion as the list.

### CRM aside (right sidebar)

320px wide, panel bg, border-left, scrolls independently. Padding 20px, flex
column gap 20, sticky.

Sections (in order):

1. **CRM**:
   - `h3` "CRM" — 10.5/600/0.06em uppercase, subtle.
   - **Status** field:
     - Label "Status" (11 subtle) with right-aligned save indicator.
     - shadcn `<Select>`: panel bg, 1px border, 6px radius, padding `6px 9px`,
       13px text. Focus ring as defined above.
     - On change → write to DB immediately (no submit button). Show
       "Saving…" italic subtle, then "✓ Saved" in emerald `#16a34a`
       (non-italic) for ~1.4s.
   - **Notes** field (textarea):
     - Min-height 100, vertical resize, 1.5 line-height, 13px.
     - Debounce 600ms. Same Saving/Saved indicator.
   - **Tags** field (text input):
     - Hint to the right of the label: "comma-separated" in 10.5 dim.
     - Debounce 600ms. On save, split by comma, trim, drop empties → write as
       `string[]` (or comma-joined string per the Prisma schema).
     - Below input: tag cloud showing the saved tags (current value).

2. **Snapshot** (`h3` "Snapshot"):
   - 2-col CSS grid, gap 6.
   - Each cell (`.qs`): 1px border, 6px radius, padding `8px 10px`.
     - `k`: 10.5/600 uppercase/0.05em subtle.
     - `v`: 15/600 fg, tabular nums.
     - `sub`: 11 muted.
   - Cells: **Fit** (e.g. "5/5" / `recommendedOutreach`), **Confidence** (`70%` / model), **Followers** (`fmtNum` / `N repos`), **Account** (years on GitHub).

3. **Fork** (`h3` "Fork"):
   - Inline text, 12.5 muted, line-height 1.55.
   - If `hasOwnCommits`: emerald "● Own commits" + `· N ahead, M behind`.
   - Else: subtle "○ Clone only" + `· M behind`.
   - Sub-line: "Last push {relTime}" in dim.

4. **Keyboard** (`h3` "Keyboard"):
   - 11 subtle list, two-column rows: action ↔ `kbd`. Show Esc, J/K, /.

The CRM aside position is configurable in the prototype (left/right Tweak). For
production: keep on the right.

---

## Interactions & state

### Routing

- `/` — list page (RSC, reads `searchParams`).
- `/candidates/[login]` — detail page (RSC, reads by login).
- Top-bar logo / crumb / "← All candidates" all navigate back to `/` while
  preserving filter/sort params (store them in the URL of the list page; pass
  back via a Server Action or via a `from` query param).

### URL params (list)

| Param        | Type    | Default      |
| ------------ | ------- | ------------ |
| `q`          | string  | `""`         |
| `status`     | string  | `"all"`      |
| `seniority`  | string  | `"all"`      |
| `minFit`     | 0–5     | `0`          |
| `language`   | string  | `"all"`      |
| `hasCommits` | bool    | `false`      |
| `sort`       | string  | `"fit-desc"` |

### Client-only state

- **Filter bar component** — reads from URL search params, writes via
  `router.replace(`?${params}`, { scroll: false })`. Each control is
  controlled; debounce the search input by 200ms before pushing to URL.
- **Row keyboard nav** — active row index in `useState`, reset to 0 when the
  filtered list changes. Wire `keydown` on `window`; check `e.target` is not
  an input/textarea/select; clamp to bounds. Scroll active row into view if
  near the edge of the scroll container.
- **CRM panel** — local controlled values for status/notes/tags. On change:
  - Status: write via Server Action immediately.
  - Notes / tags: debounce 600ms then write. Status indicator transitions
    `null → "saving" → "saved" → null` (1.4s fade).
- **Detail prev/next** — load the candidate list in the same query order from
  the list page (could be a small endpoint that returns `{ prev, next }` for
  the current login given the filter set). Bind `j`/`k` to navigate.

### Animations

- New view fade-in: 140ms ease-out, 2px upward translate (`view-enter`).
- Save indicator: instant on, instant off after 1.4s. No spinner — text-only.
- Hover transitions: none (intentionally crisp).
- Popovers: appear/disappear without animation, dismiss on outside click.

### Empty / loading / error states

- **List empty (filtered to zero)**: centered empty state, 36×36 circle with
  `∅`, "No candidates match these filters.", and a "Clear filters" link button
  that resets all URL params.
- **List loading**: render the toolbar + meta strip immediately (server-side),
  show row skeletons during streaming if needed.
- **List error**: panel with the error message and a retry link.
- **Detail not found**: 404 page styled with the same topbar; main shows
  "Candidate `@login` not found." + back link.

---

## Component shopping list (shadcn/ui)

Use these primitives where you can:

| Need                  | shadcn component                       |
| --------------------- | -------------------------------------- |
| Search field          | `Input` + custom kbd hint              |
| Filter / Sort buttons | `DropdownMenu` (or `Popover` + buttons)|
| Status / Outreach pills, language badges, tags | `Badge` with custom variants per status/kind |
| Notes textarea        | `Textarea`                             |
| Status select         | `Select`                               |
| Tags input            | `Input` (plain) — no tag chip lib needed for v1 |
| Tooltip on truncated cells | `Tooltip` (e.g. hover the summary) |
| Toast on save errors  | `Sonner` / `Toaster`                   |

Lucide icons used: `Search`, `MapPin`, `Building2`, `Github`, `Globe`,
`Twitter`, `Linkedin`, `Star`, `GitFork`, `ArrowDown`, `ArrowUp`,
`ChevronDown`, `ChevronLeft`, `ChevronRight`, `Check`, `Download`.

---

## Assets

No external image assets are required. Avatars use real `avatarUrl` from
GitHub when present; otherwise initials on a 12-color rotating palette
(`AV_BG` in `data.js`).

Geist + Geist Mono are loaded from Google Fonts in the prototype. In the
Next.js app, prefer `next/font/google` for self-hosting:

```tsx
import { Geist, Geist_Mono } from "next/font/google";
const geist = Geist({ subsets: ["latin"], weight: ["400","500","600","700"] });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400","500"] });
```

---

## Out of scope for v1 (do not port)

- The Tweaks panel and theme variants (GitHub/Notion). Build the Linear theme
  only.
- Fit-score treatments other than the chip.
- Density modes other than "ultra".
- Avatar shapes other than "rounded" (5px radius squircle).
- Left-sidebar CRM layout. Keep CRM on the right.
- The mock `data.js` generator. Read from Prisma in the RSC.

These were exploration knobs for the design review, not product features.
