# Talent Scout — UI Design Brief

Design a CRM-style web app for triaging engineering candidates sourced from GitHub. This is a **local-only, single-user tool** — no auth. The user is a technical recruiter/founder scouting developers who forked an open-source AI legal platform.

## What the app does

A Python pipeline crawls ~900 GitHub forkers, enriches them with GitHub data + LinkedIn profiles + web presence, then sends everything to Claude Opus 4.7 which produces a structured engineering profile for each person. The web app is the read/triage layer — browse profiles, filter/sort, drill into details, and manage a lightweight CRM workflow (status, notes, tags).

## Data available per candidate

**GitHub basics:** login, name, bio, location, company, blog, twitter, avatar URL, followers count, public repos count, account age

**Fork metadata:** whether they made their own commits to the fork, how far ahead/behind the upstream, fork push date

**Top repos (up to 10):** name, language, stars, forks, description, whether it's a fork itself, last push date

**Recent activity (up to 30 events):** event type (PushEvent, PullRequestEvent, IssuesEvent, etc.), repo name, timestamp

**LinkedIn profile (when found):** profile URL, headline, current title + company, location, connection count, full work experience (title/company/duration/description for each role), education, skills list, certifications

**Web mentions (0-10 per candidate):** URL, page title, snippet, source type (google/blog/conference/github_mentions), extracted page content as markdown

**Claude's assessment (the "Profile"):**
- Summary (2-3 sentences)
- Seniority: junior / mid / senior / staff / unknown
- Fit score: 1-5 (for a legal-AI engineering role)
- Fit reasoning (paragraph)
- Recommended outreach: yes / no / maybe
- Outreach reason (sentence)
- Confidence: 0.0-1.0
- Signals: list of {kind: positive|negative|notable, text}
- Skills: list of tag strings (e.g. "TypeScript", "Python", "ML", "legal-tech")
- Model used, prompt version, generation timestamp, raw JSON

**CRM state:** status (new → reviewing → interested → contacted → passed → hired), free-text notes, comma-separated tags

## Pages needed

### 1. Candidate List (home page `/`)

The main triage surface. Shows all ~900 candidates in a dense, scannable format.

**Each row should show:** avatar, name/login, location, 1-line summary (from Claude), fit score (prominent — this is the main ranking signal), top 2-3 language badges, status pill, and enough info to decide "should I click into this person?"

**Filtering (persistent via URL params):**
- Status dropdown (all, new, reviewing, interested, contacted, passed, hired)
- Seniority dropdown
- Fit score range (min-max, or just "3+", "4+", "5")
- Has own commits on fork (boolean toggle)
- Language filter
- Free-text search across name, bio, login

**Sorting:** Fit score desc (default), followers, public repos, recently fetched

**Feel:** Dense but not cluttered. Think GitHub's repo list or Linear's issue list — every pixel earns its place. No cards-in-a-grid; this is a **list** optimized for scanning 50+ items.

### 2. Candidate Detail (`/candidates/[login]`)

Everything we know about one person. Two-column layout on desktop: main content left, CRM panel sticky on right.

**Header:** Large avatar, name, login, location, company, links (GitHub, blog, Twitter, LinkedIn URL if found). Status pill.

**Profile Assessment card:** Claude's summary, seniority badge, fit score (large), fit reasoning, recommended outreach + reason, confidence indicator.

**Signals section:** Grouped by kind — positive signals, negative signals, notable signals. Visually distinct (green/red/blue or similar). These are the most important detail for the recruiter to scan.

**Skills:** Tag cloud or horizontal tag list. Should feel lightweight.

**LinkedIn section (if available):** Headline, current role, work history timeline (most recent first — title, company, duration), education, skills from LinkedIn. This is often the richest professional context. Make it feel distinct from the GitHub data.

**Web Presence (if available):** Cards or compact list for each web mention — title, source badge, snippet, link. Blog posts and conference talks are high-signal; make them scannable.

**Top Repos:** Cards with name, language, stars, forks, description. Link to GitHub. Show if it's a fork.

**Recent Activity:** Compact timeline — date, event type badge, repo name. Scrollable or collapsible. Lower priority than signals/repos.

**CRM Panel (right column, sticky):**
- Status select (immediate save, no submit button)
- Notes textarea (autosave on debounce, no submit button)
- Tags input (comma-separated, autosave)
- "Saving..." indicator when persisting

**Feel:** Information-dense but well-organized. The recruiter is making a go/no-go decision — signals, fit score, and LinkedIn experience are what they look at first. Repos and activity are supporting evidence.

## Design constraints

- **Tech stack:** Next.js 16 App Router, Tailwind CSS v4, shadcn/ui components (Radix primitives). Server components for data fetching, client components only for interactive elements (CRM panel, filter bar).
- **No auth, no dark mode needed.** Local tool.
- **Must work well at 1280px+ width.** Mobile is nice-to-have but not critical — this is a desktop workflow tool.
- **Performance:** List page loads ~100 candidates server-side. No client-side data fetching or infinite scroll needed for v1.

## Aesthetic direction

Professional, utilitarian, tool-like. Think Linear, Notion, or GitHub's UI — not flashy, not minimal-for-its-own-sake, just dense and functional. Neutral color palette with color used sparingly for semantic meaning:
- Fit scores: color-coded (1=gray, 2=yellow, 3=blue, 4=green, 5=emerald)
- Status pills: distinct colors per status
- Signal kinds: green (positive), red (negative), blue (notable)
- Everything else: grays, borders, subtle backgrounds

Avoid: hero sections, marketing aesthetics, excessive whitespace, cards-everywhere layouts, decorative elements. This is an internal tool for someone who will use it for hours.
