import json
import subprocess
import time
from typing import Any

from claude_agent_sdk import tool, create_sdk_mcp_server
from firecrawl import FirecrawlApp
from rich.console import Console

from scout import db
from scout.cache import cache_get, cache_set
from scout.config import get_firecrawl_key, get_browserbase_keys, get_api_key
from scout.events import publish

console = Console()

# Module-level state set per-candidate by the enrichment orchestrator
_current_login: str = ""
_current_conn: Any = None


def set_context(login: str, conn: Any) -> None:
    global _current_login, _current_conn
    _current_login = login
    _current_conn = conn


def _notify_display(tool: str, detail: str, duration_ms: int = 0, ok: bool = True) -> None:
    try:
        from scout.enrich import get_display
        d = get_display()
        if d:
            d.add_tool_call(tool, detail, duration_ms, ok)
    except Exception:
        pass
    publish(_current_login, "tool_call", {"tool": tool, "detail": detail, "durationMs": duration_ms, "ok": ok})


def _notify_persist(what: str) -> None:
    try:
        from scout.enrich import get_display
        d = get_display()
        if d:
            d.add_persist(what)
    except Exception:
        pass
    publish(_current_login, "persist", {"what": what})


def _log(tool_name: str, input_data: dict, output: Any, duration_ms: int, error: str | None = None) -> None:
    if _current_conn and _current_login:
        try:
            db.insert_enrichment_log(_current_conn, _current_login, tool_name, input_data, output, duration_ms, error)
            _current_conn.commit()
        except Exception as e:
            try:
                _current_conn.rollback()
            except Exception:
                pass
            pass  # log warning suppressed for Live display


# ─── Tool 1: gh_query ────────────────────────────────────────────────────────

@tool(
    "gh_query",
    "Query the GitHub REST API. Returns JSON. Use for profiles, repos, events, READMEs, commits.",
    {
        "type": "object",
        "properties": {
            "endpoint": {"type": "string", "description": "GitHub API path, e.g. /users/octocat"},
            "jq_filter": {"type": "string", "description": "Optional jq filter to apply"},
        },
        "required": ["endpoint"],
    },
)
async def gh_query(args: dict[str, Any]) -> dict[str, Any]:
    endpoint = args["endpoint"]
    start = time.time()

    cached = cache_get("gh", endpoint)
    if cached is not None:
        _notify_display("gh_query", f"{endpoint} (cached)", 0, True)
        _log("gh_query", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": json.dumps(cached, default=str)[:10000]}]}

    cmd = ["gh", "api", endpoint]
    jq_filter = args.get("jq_filter")
    if jq_filter:
        cmd.extend(["--jq", jq_filter])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        duration = int((time.time() - start) * 1000)

        if result.returncode != 0:
            error_msg = result.stderr[:200]
            _notify_display("gh_query", f"{endpoint} — {error_msg[:60]}", duration, False)
            _log("gh_query", args, None, duration, error_msg)
            return {"content": [{"type": "text", "text": f"Error: {error_msg}"}], "is_error": True}

        try:
            data = json.loads(result.stdout) if result.stdout.strip() else {}
        except json.JSONDecodeError:
            data = {"raw": result.stdout[:5000]}
        cache_set("gh", endpoint, data, ttl=3600)
        _persist_gh_data(endpoint, data)

        _notify_display("gh_query", f"{endpoint} ({len(result.stdout)} chars)", duration, True)
        _log("gh_query", args, data, duration)
        return {"content": [{"type": "text", "text": result.stdout[:10000] or "(empty)"}]}

    except subprocess.TimeoutExpired:
        duration = int((time.time() - start) * 1000)
        _notify_display("gh_query", f"{endpoint} — timeout", duration, False)
        _log("gh_query", args, None, duration, "timeout")
        return {"content": [{"type": "text", "text": "gh api timed out"}], "is_error": True}
    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("gh_query", f"{endpoint} — {e}", duration, False)
        _log("gh_query", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Error: {e}"}], "is_error": True}


def _persist_gh_data(endpoint: str, data: Any) -> None:
    if not _current_conn or not _current_login:
        return
    try:
        if endpoint == f"/users/{_current_login}" and isinstance(data, dict):
            db.upsert_candidate(_current_conn, data)
            db.ensure_crm(_current_conn, _current_login)
            _notify_persist("Candidate")
        elif f"/users/{_current_login}/repos" in endpoint and isinstance(data, list):
            db.insert_repos(_current_conn, _current_login, data[:10])
            _notify_persist(f"{min(len(data), 10)} Repos")
        elif f"/users/{_current_login}/events" in endpoint and isinstance(data, list):
            db.insert_events(_current_conn, _current_login, data[:30])
            _notify_persist(f"{min(len(data), 30)} Events")
        _current_conn.commit()
    except Exception as e:
        try:
            _current_conn.rollback()
        except Exception:
            pass
        pass  # persist warning suppressed for Live display


# ─── Tool 2: web_search ──────────────────────────────────────────────────────

@tool(
    "web_search",
    "Search Google for a person or topic. Returns titles, URLs, and snippets.",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results (default 8)"},
        },
        "required": ["query"],
    },
)
async def web_search(args: dict[str, Any]) -> dict[str, Any]:
    query = args["query"]
    limit = args.get("limit", 8)
    start = time.time()

    cached = cache_get("firecrawl_search", query)
    if cached is not None:
        _log("web_search", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": cached}]}

    try:
        app = FirecrawlApp(api_key=get_firecrawl_key())
        result = app.search(query, limit=limit)
        duration = int((time.time() - start) * 1000)

        lines = []
        items = []
        if hasattr(result, "web") and result.web:
            items = result.web
        elif hasattr(result, "data") and result.data:
            items = result.data
        elif isinstance(result, list):
            items = result

        for r in items:
            title = getattr(r, "title", "") or (r.get("title", "") if isinstance(r, dict) else "")
            url = getattr(r, "url", "") or (r.get("url", "") if isinstance(r, dict) else "")
            desc = getattr(r, "description", "") or (r.get("description", "") if isinstance(r, dict) else "")
            if url:
                lines.append(f"- {title}\n  {url}\n  {desc[:200]}")

        text = "\n".join(lines) or "No results found."
        _notify_display("web_search", f'"{query[:50]}" → {len(items)} results', duration, True)
        cache_set("firecrawl_search", query, text, ttl=86400)
        _log("web_search", args, {"count": len(items)}, duration)
        return {"content": [{"type": "text", "text": text}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("web_search", f'"{query[:50]}" — {e}', duration, False)
        _log("web_search", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Search error: {e}"}], "is_error": True}


# ─── Tool 3: web_scrape ──────────────────────────────────────────────────────

@tool(
    "web_scrape",
    "Extract content from a URL as clean markdown. Use for blogs, personal sites, articles.",
    {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to scrape"},
        },
        "required": ["url"],
    },
)
async def web_scrape(args: dict[str, Any]) -> dict[str, Any]:
    url = args["url"]
    start = time.time()

    cached = cache_get("firecrawl_scrape", url)
    if cached is not None:
        _log("web_scrape", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": cached}]}

    try:
        app = FirecrawlApp(api_key=get_firecrawl_key())
        result = app.scrape(url, formats=["markdown"])
        duration = int((time.time() - start) * 1000)

        content = result.markdown if hasattr(result, "markdown") else ""
        if not content and isinstance(result, dict):
            content = result.get("markdown", "")

        # Side-effect: persist as WebMention
        if content and len(content) >= 100 and _current_conn and _current_login:
            try:
                title = getattr(result, "metadata", {}).get("title", "") if hasattr(result, "metadata") else ""
                source = "blog" if any(k in url.lower() for k in ["blog", "medium.com", "dev.to"]) else "google"
                db.insert_web_mentions(_current_conn, _current_login, [{
                    "url": url, "title": title, "snippet": content[:300],
                    "source": source, "content": content[:5000],
                }])
                _current_conn.commit()
                _notify_persist(f"WebMention ({len(content)} chars)")
            except Exception as e:
                try:
                    _current_conn.rollback()
                except Exception:
                    pass
                pass  # persist warning suppressed for Live display

        truncated = content[:8000] or "Could not extract content."
        _notify_display("web_scrape", f"{url[:60]} ({len(content)} chars)", duration, True)
        cache_set("firecrawl_scrape", url, truncated, ttl=86400)
        _log("web_scrape", args, {"chars": len(content)}, duration)
        return {"content": [{"type": "text", "text": truncated}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("web_scrape", f"{url[:60]} — {e}", duration, False)
        _log("web_scrape", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Scrape error: {e}"}], "is_error": True}


# ─── Tool 4: linkedin_lookup ─────────────────────────────────────────────────

@tool(
    "linkedin_lookup",
    "Find and extract a LinkedIn profile. Uses a stealth browser — slow but thorough.",
    {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Person's full name"},
            "company": {"type": "string", "description": "Current or recent company (optional)"},
            "title": {"type": "string", "description": "Job title (optional)"},
        },
        "required": ["name"],
    },
)
async def linkedin_lookup(args: dict[str, Any]) -> dict[str, Any]:
    name = args["name"]
    company = args.get("company", "")
    start = time.time()

    try:
        from scout.linkedin import scrape_linkedin
        result = await scrape_linkedin(name, company, _current_login)
        duration = int((time.time() - start) * 1000)

        if result:
            if _current_conn and _current_login:
                try:
                    db.upsert_linkedin_profile(_current_conn, _current_login, result)
                    _current_conn.commit()
                    _notify_persist("LinkedInProfile")
                except Exception as e:
                    try: _current_conn.rollback()
                    except Exception: pass
                    pass  # persist warning suppressed for Live display

            text = json.dumps(result, indent=2, default=str)
            _notify_display("linkedin", f"{name} — {result.get('headline', 'found')}", duration, True)
            _log("linkedin_lookup", args, result, duration)
            return {"content": [{"type": "text", "text": text}]}
        else:
            _notify_display("linkedin", f"{name} — not found", duration, False)
            if _current_conn and _current_login:
                try:
                    db.upsert_linkedin_profile(_current_conn, _current_login, {})
                    _current_conn.commit()
                except Exception:
                    try: _current_conn.rollback()
                    except Exception: pass
            _log("linkedin_lookup", args, None, duration, "not found")
            return {"content": [{"type": "text", "text": "LinkedIn profile not found."}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("linkedin", f"{name} — {e}", duration, False)
        _log("linkedin_lookup", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"LinkedIn error: {e}"}], "is_error": True}


# ─── Tool 5: technical_assess ─────────────────────────────────────────────────

ASSESSOR_PROMPT = """You are a senior engineering technical assessor. You will be given a GitHub developer's login and a list of their most interesting repositories.

Your job is to READ ACTUAL CODE from these repos and assess the developer's technical ability. Use the gh_query tool to:

1. Get the file tree: gh_query endpoint="/repos/{owner}/{repo}/git/trees/HEAD?recursive=1" jq_filter=".tree[].path"
2. Read key source files (NOT test files first — read the actual implementation):
   - Look for: main entry points, core modules, API routes, data models, algorithms
   - gh_query endpoint="/repos/{owner}/{repo}/contents/{path}" jq_filter=".content"
   - The content is base64 encoded — describe what you can infer from the structure
3. Check for tests: look for test directories, test files, CI config
4. Check package.json/pyproject.toml/Cargo.toml for dependency choices
5. Look at recent commits for commit message quality: gh_query endpoint="/repos/{owner}/{repo}/commits?per_page=10"

ASSESS:
- Code organization and architecture patterns
- Framework and library choices (are they modern, appropriate?)
- Error handling and edge case awareness
- Testing practices (any tests? what kind?)
- Documentation quality (README, comments, docstrings)
- Commit discipline (message quality, commit size)
- Overall engineering maturity: junior / mid / senior / staff

Be specific — cite actual files and patterns you observed. Don't guess from repo names alone.
Provide your assessment as structured markdown with sections for each area."""


@tool(
    "technical_assess",
    "Dispatch a technical assessor subagent to read actual code from a developer's repos and evaluate their engineering ability. Use this when you've found interesting original (non-fork) repos worth a deeper look.",
    {
        "type": "object",
        "properties": {
            "login": {"type": "string", "description": "GitHub username"},
            "repos": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of repo names to assess (their most interesting original repos, max 3)",
            },
        },
        "required": ["login", "repos"],
    },
)
async def technical_assess(args: dict[str, Any]) -> dict[str, Any]:
    login = args["login"]
    repos = args.get("repos", [])[:3]
    start = time.time()
    _notify_display("technical_assess", f"{login}: {', '.join(repos)}", 0, True)

    try:
        from claude_agent_sdk import (
            query as agent_query, ClaudeAgentOptions,
            ResultMessage, AssistantMessage, ToolUseBlock, TextBlock,
        )

        assessor_server = create_sdk_mcp_server(
            name="gh",
            version="1.0.0",
            tools=[gh_query],
        )

        repo_list = "\n".join(f"- {login}/{r}" for r in repos)
        assessment = None
        sub_tools = 0

        publish(_current_login, "subagent_start", {"name": "Technical Assessor", "description": "Reading source code from repos"})

        async for message in agent_query(
            prompt=(
                f"Assess the technical ability of GitHub developer '{login}' by reading "
                f"code from these repositories:\n{repo_list}\n\n"
                f"Read actual source files, not just READMEs. Focus on code quality, "
                f"architecture, and engineering maturity."
            ),
            options=ClaudeAgentOptions(
                system_prompt=ASSESSOR_PROMPT,
                mcp_servers={"gh": assessor_server},
                allowed_tools=["mcp__gh__gh_query"],
                max_turns=20,
            ),
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text.strip():
                        _notify_display("assessor", block.text.strip()[:80], 0, True)
                        publish(_current_login, "subagent_reasoning", {"name": "Technical Assessor", "text": block.text.strip()})
                        # Also push to the enrichment display's reasoning
                        try:
                            from scout.enrich import get_display
                            d = get_display()
                            if d:
                                d.set_reasoning(f"🔍 **Technical Assessor:**\n\n{block.text.strip()}")
                        except Exception:
                            pass
                    elif isinstance(block, ToolUseBlock):
                        sub_tools += 1
                        _notify_display("assessor", f"reading code... ({sub_tools} calls)", 0, True)
            elif isinstance(message, ResultMessage) and message.subtype == "success":
                assessment = message.result

        duration = int((time.time() - start) * 1000)
        publish(_current_login, "subagent_end", {"name": "Technical Assessor", "duration_ms": duration})
        _notify_display("technical_assess", f"done — {sub_tools} code reads, {duration/1000:.0f}s", duration, True)
        _log("technical_assess", args, {"length": len(assessment or ""), "sub_tools": sub_tools}, duration)

        return {"content": [{"type": "text", "text": assessment or "Assessment could not be completed."}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("technical_assess", f"{login}: {e}", duration, False)
        _log("technical_assess", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Assessment error: {e}"}], "is_error": True}


# ─── Tool 6: legal_relevance_assess ───────────────────────────────────────────

LEGAL_ASSESSOR_PROMPT = """You are a legal-tech industry analyst. Your job is to assess a software developer's connection to the legal technology space.

You have two tools:
- gh_query: Pull GitHub data (repos, READMEs, code files)
- web_search: Search the web

INVESTIGATE their connection to legal/legal-tech from multiple angles:

1. **Direct legal-tech work**: Do they have repos related to legal tech, court systems, case management, legal document processing, e-discovery, contract analysis, compliance automation, regulatory tech?

2. **Employer connection**: Does their company (current or past) operate in legal tech? Search for "{company} legal technology" or "{company} law". Law firms, legal SaaS companies, compliance platforms, court technology vendors all count.

3. **Domain expertise overlap**: Even without direct legal work, do they have relevant adjacent skills?
   - NLP/document processing → legal document analysis
   - AI/ML → legal AI, predictive analytics for litigation
   - Compliance/security → regulatory tech
   - Government/civic tech → court systems, public records
   - Data pipelines → legal data processing, e-discovery

4. **The fork itself**: Why might they have forked willchen96/mike (an AI legal platform)?
   - Did they modify it? (Check their fork's commits if available)
   - Is it related to their other work?
   - Did they just star/fork everything trending that day?

5. **Web presence**: Search for "{name} legal tech", "{name} law technology", "{name} compliance". Check if they've written about, spoken about, or worked in legal tech.

RATE their legal-tech relevance on a scale:
- **Deep**: Works directly in legal tech (legal SaaS, law firm tech, court systems)
- **Adjacent**: Works in a closely related field (compliance, NLP, gov-tech, document AI)
- **Transferable**: Has relevant skills but no legal connection found
- **None**: No legal-tech signal — likely a drive-by fork

Provide specific evidence for your rating. Don't speculate without data."""


@tool(
    "legal_relevance_assess",
    "Investigate a candidate's connection to the legal/legal-tech industry. Searches for legal industry experience, law-adjacent projects, compliance work, regulatory tech, and reasons they forked an AI legal platform.",
    {
        "type": "object",
        "properties": {
            "login": {"type": "string", "description": "GitHub username"},
            "context": {"type": "string", "description": "What you already know: name, company, bio, notable repos, etc."},
        },
        "required": ["login"],
    },
)
async def legal_relevance_assess(args: dict[str, Any]) -> dict[str, Any]:
    login = args["login"]
    context = args.get("context", "")
    start = time.time()
    _notify_display("legal_assess", f"investigating {login}", 0, True)

    try:
        from claude_agent_sdk import (
            query as agent_query, ClaudeAgentOptions,
            ResultMessage, AssistantMessage, ToolUseBlock, TextBlock,
        )

        assessor_server = create_sdk_mcp_server(
            name="tools",
            version="1.0.0",
            tools=[gh_query, web_search],
        )

        assessment = None
        sub_tools = 0

        publish(_current_login, "subagent_start", {"name": "Legal Relevance Assessor", "description": "Investigating legal-tech connections"})

        async for message in agent_query(
            prompt=(
                f"Investigate the legal-tech relevance of GitHub developer '{login}'. "
                f"Here's what we know so far:\n{context}\n\n"
                f"Determine how connected this person is to the legal technology space. "
                f"Search broadly — check their repos, employer, web presence, and any legal-adjacent work."
            ),
            options=ClaudeAgentOptions(
                system_prompt=LEGAL_ASSESSOR_PROMPT,
                mcp_servers={"tools": assessor_server},
                allowed_tools=["mcp__tools__gh_query", "mcp__tools__web_search"],
                max_turns=15,
            ),
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text.strip():
                        _notify_display("legal_assess", block.text.strip()[:80], 0, True)
                        publish(_current_login, "subagent_reasoning", {"name": "Legal Relevance Assessor", "text": block.text.strip()})
                        try:
                            from scout.enrich import get_display
                            d = get_display()
                            if d:
                                d.set_reasoning(f"⚖️ **Legal Relevance Assessor:**\n\n{block.text.strip()}")
                        except Exception:
                            pass
                    elif isinstance(block, ToolUseBlock):
                        sub_tools += 1
                        _notify_display("legal_assess", f"researching... ({sub_tools} searches)", 0, True)
            elif isinstance(message, ResultMessage) and message.subtype == "success":
                assessment = message.result

        duration = int((time.time() - start) * 1000)
        publish(_current_login, "subagent_end", {"name": "Legal Relevance Assessor", "duration_ms": duration})
        _notify_display("legal_assess", f"done — {sub_tools} searches, {duration/1000:.0f}s", duration, True)
        _log("legal_relevance_assess", args, {"length": len(assessment or ""), "sub_tools": sub_tools}, duration)

        return {"content": [{"type": "text", "text": assessment or "Could not assess legal relevance."}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _notify_display("legal_assess", f"{login}: {e}", duration, False)
        _log("legal_relevance_assess", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Legal assessment error: {e}"}], "is_error": True}


# ─── MCP Server ──────────────────────────────────────────────────────────────

enrichment_mcp_server = create_sdk_mcp_server(
    name="tools",
    version="1.0.0",
    tools=[gh_query, web_search, web_scrape, linkedin_lookup, technical_assess, legal_relevance_assess],
)
