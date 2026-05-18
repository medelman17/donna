import json


SYSTEM_PROMPT = """You are a senior engineering recruiter at an AI-first legal technology company. You are evaluating GitHub profiles of developers who forked an open-source AI legal platform (TypeScript/Python stack).

Your job is to produce a structured assessment of each developer. Be thorough and balanced:
- Look for genuine engineering signals: own projects, contribution patterns, code quality indicators
- Identify relevant skills: TypeScript, Python, AI/ML, legal-tech, full-stack, DevOps
- Note red flags honestly: drive-by forks with no activity, abandoned profiles, sparse contribution history
- Assess fit for a legal-AI engineering role specifically

You may also receive LinkedIn profile data and web mentions (blog posts, conference talks, personal sites). Use this to build a more complete picture:
- LinkedIn experience and skills complement GitHub activity
- Blog posts and talks indicate thought leadership
- Conference appearances suggest community involvement
- Gaps between LinkedIn and GitHub (e.g., claims senior role but sparse GitHub) are worth noting

You also have access to web_search and web_fetch tools. If the provided data leaves gaps that a quick search could fill, use them — but don't search for every candidate. Use them when something seems promising but incomplete.

Rate fit on a 1-5 scale:
1 = No relevant signal (empty profile, drive-by fork)
2 = Minimal signal (few repos, no relevant tech)
3 = Some relevant experience but unclear fit
4 = Strong relevant experience
5 = Exceptional fit (deep AI + legal/compliance + TypeScript/Python)

You MUST call the record_profile tool with your assessment."""

TOOL_SCHEMA = {
    "name": "record_profile",
    "description": "Record the structured profile assessment for a candidate",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "2-3 sentence summary of the developer's profile and relevance",
            },
            "seniority": {
                "type": "string",
                "enum": ["junior", "mid", "senior", "staff", "unknown"],
            },
            "fit_score": {
                "type": "integer",
                "enum": [1, 2, 3, 4, 5],
            },
            "fit_reasoning": {"type": "string"},
            "recommended_outreach": {
                "type": "string",
                "enum": ["yes", "no", "maybe"],
            },
            "outreach_reason": {"type": "string"},
            "confidence": {"type": "number"},
            "signals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["positive", "negative", "notable"]},
                        "text": {"type": "string"},
                    },
                    "required": ["kind", "text"],
                },
            },
            "skills": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "summary", "seniority", "fit_score", "fit_reasoning",
            "recommended_outreach", "outreach_reason", "confidence",
            "signals", "skills",
        ],
    },
}


def build_user_message(bundle: dict) -> str:
    parts = []

    parts.append(f"## GitHub Profile: {bundle['login']}")
    for field in ["name", "bio", "location", "company", "blog", "twitter", "hireable"]:
        val = bundle.get(field)
        if val:
            parts.append(f"- **{field}**: {val}")
    parts.append(f"- **Followers**: {bundle.get('followers', 0)}")
    parts.append(f"- **Public repos**: {bundle.get('publicRepos', 0)}")
    parts.append(f"- **GitHub since**: {bundle.get('githubCreatedAt', 'unknown')}")

    fm = bundle.get("fork_meta")
    if fm:
        parts.append(f"\n## Fork of willchen96/mike")
        parts.append(f"- Ahead by: {fm.get('aheadBy', 0)} commits")
        parts.append(f"- Behind by: {fm.get('behindBy', 0)} commits")
        parts.append(f"- Has own commits: {fm.get('hasOwnCommits', False)}")

    repos = bundle.get("repos", [])
    if repos:
        parts.append(f"\n## Top Repos ({len(repos)})")
        for r in repos:
            lang = r.get("language") or "unknown"
            desc = (r.get("description") or "")[:100]
            fork_tag = " [fork]" if r.get("isFork") else ""
            parts.append(f"- **{r['name']}** ({lang}, {r.get('stars', 0)} stars){fork_tag}: {desc}")

    events = bundle.get("events", [])
    if events:
        types: dict[str, int] = {}
        for e in events:
            types[e["type"]] = types.get(e["type"], 0) + 1
        parts.append(f"\n## Recent Activity ({len(events)} events)")
        for t, count in sorted(types.items(), key=lambda x: -x[1]):
            parts.append(f"- {t}: {count}")

    lang_counts: dict[str, int] = {}
    for r in repos:
        lang = r.get("language")
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1
    if lang_counts:
        parts.append("\n## Language Distribution")
        for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
            parts.append(f"- {lang}: {count} repos")

    li = bundle.get("linkedin")
    if li:
        parts.append("\n## LinkedIn Profile")
        if li.get("headline"):
            parts.append(f"- **Headline**: {li['headline']}")
        if li.get("currentTitle"):
            parts.append(f"- **Current Role**: {li['currentTitle']} at {li.get('currentCompany', 'unknown')}")
        if li.get("location"):
            parts.append(f"- **Location**: {li['location']}")
        exp = li.get("experience")
        if exp:
            exp_list = json.loads(exp) if isinstance(exp, str) else exp
            for role in exp_list[:5]:
                dur = f" ({role.get('duration', '')})" if role.get("duration") else ""
                parts.append(f"- {role.get('title', '?')} at {role.get('company', '?')}{dur}")
        edu = li.get("education")
        if edu:
            edu_list = json.loads(edu) if isinstance(edu, str) else edu
            for school in edu_list[:3]:
                parts.append(f"- Education: {school.get('degree', '')} {school.get('field', '')} — {school.get('school', '')}")
        skills_raw = li.get("skills")
        if skills_raw:
            skill_list = json.loads(skills_raw) if isinstance(skills_raw, str) else skills_raw
            if skill_list:
                parts.append(f"- **LinkedIn Skills**: {', '.join(skill_list[:15])}")

    mentions = bundle.get("web_mentions", [])
    if mentions:
        parts.append(f"\n## Web Presence ({len(mentions)} mentions found)")
        for m in mentions[:8]:
            title = m.get("title") or m.get("url", "")
            source = m.get("source", "web")
            snippet = (m.get("snippet") or "")[:200]
            content_preview = (m.get("content") or "")[:300]
            parts.append(f"- [{source}] {title}")
            if snippet:
                parts.append(f"  > {snippet}")
            elif content_preview:
                parts.append(f"  > {content_preview}")

    return "\n".join(parts)
