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

console = Console()

# Module-level state set per-candidate by the enrichment orchestrator
_current_login: str = ""
_current_conn: Any = None


def set_context(login: str, conn: Any) -> None:
    global _current_login, _current_conn
    _current_login = login
    _current_conn = conn


def _log(tool_name: str, input_data: dict, output: Any, duration_ms: int, error: str | None = None) -> None:
    if _current_conn and _current_login:
        db.insert_enrichment_log(_current_conn, _current_login, tool_name, input_data, output, duration_ms, error)
        _current_conn.commit()


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
    console.print(f"      [cyan]gh api[/cyan] {endpoint}")

    cached = cache_get("gh", endpoint)
    if cached is not None:
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
            error_msg = result.stderr[:500]
            console.print(f"      [red]gh api error:[/red] {error_msg[:80]}")
            _log("gh_query", args, None, duration, error_msg)
            return {"content": [{"type": "text", "text": f"Error: {error_msg}"}], "is_error": True}

        data = json.loads(result.stdout) if result.stdout.strip() else {}
        cache_set("gh", endpoint, data, ttl=3600)

        # Side-effect: persist GitHub data
        _persist_gh_data(endpoint, data)

        preview = result.stdout[:200].replace("\n", " ")
        console.print(f"      [green]ok[/green] ({duration}ms, {len(result.stdout)} chars) {preview}...")
        _log("gh_query", args, data, duration)
        return {"content": [{"type": "text", "text": result.stdout[:10000] or "(empty)"}]}

    except subprocess.TimeoutExpired:
        duration = int((time.time() - start) * 1000)
        _log("gh_query", args, None, duration, "timeout")
        return {"content": [{"type": "text", "text": "gh api timed out"}], "is_error": True}
    except Exception as e:
        duration = int((time.time() - start) * 1000)
        _log("gh_query", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"Error: {e}"}], "is_error": True}


def _persist_gh_data(endpoint: str, data: Any) -> None:
    if not _current_conn or not _current_login:
        return
    try:
        if endpoint == f"/users/{_current_login}" and isinstance(data, dict):
            db.upsert_candidate(_current_conn, data)
            db.ensure_crm(_current_conn, _current_login)
            console.print(f"      [dim]→ persisted Candidate[/dim]")
        elif f"/users/{_current_login}/repos" in endpoint and isinstance(data, list):
            db.insert_repos(_current_conn, _current_login, data[:10])
            console.print(f"      [dim]→ persisted {min(len(data), 10)} Repos[/dim]")
        elif f"/users/{_current_login}/events" in endpoint and isinstance(data, list):
            db.insert_events(_current_conn, _current_login, data[:30])
            console.print(f"      [dim]→ persisted {min(len(data), 30)} Events[/dim]")
        _current_conn.commit()
    except Exception as e:
        console.print(f"      [yellow]persist warning: {e}[/yellow]")


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
    console.print(f"      [cyan]web_search[/cyan] {query}")

    cached = cache_get("firecrawl_search", query)
    if cached is not None:
        _log("web_search", args, "(cached)", 0)
        return {"content": [{"type": "text", "text": cached}]}

    try:
        app = FirecrawlApp(api_key=get_firecrawl_key())
        result = app.search(query, limit=limit)
        duration = int((time.time() - start) * 1000)

        lines = []
        items = result.data if hasattr(result, "data") else (result if isinstance(result, list) else [])
        for r in items:
            title = getattr(r, "title", "") or (r.get("title", "") if isinstance(r, dict) else "")
            url = getattr(r, "url", "") or (r.get("url", "") if isinstance(r, dict) else "")
            desc = getattr(r, "description", "") or (r.get("description", "") if isinstance(r, dict) else "")
            if url:
                lines.append(f"- {title}\n  {url}\n  {desc[:150]}")

        text = "\n".join(lines) or "No results found."
        console.print(f"      [green]ok[/green] ({duration}ms, {len(items)} results)")
        cache_set("firecrawl_search", query, text, ttl=86400)
        _log("web_search", args, {"count": len(items)}, duration)
        return {"content": [{"type": "text", "text": text}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]web_search error:[/red] {e}")
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
    console.print(f"      [cyan]web_scrape[/cyan] {url[:80]}")

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
            title = getattr(result, "metadata", {}).get("title", "") if hasattr(result, "metadata") else ""
            source = "blog" if any(k in url.lower() for k in ["blog", "medium.com", "dev.to"]) else "google"
            db.insert_web_mentions(_current_conn, _current_login, [{
                "url": url, "title": title, "snippet": content[:300],
                "source": source, "content": content[:5000],
            }])
            _current_conn.commit()
            console.print(f"      [dim]→ persisted WebMention ({len(content)} chars)[/dim]")

        truncated = content[:8000] or "Could not extract content."
        console.print(f"      [green]ok[/green] ({duration}ms, {len(content)} chars)")
        cache_set("firecrawl_scrape", url, truncated, ttl=86400)
        _log("web_scrape", args, {"chars": len(content)}, duration)
        return {"content": [{"type": "text", "text": truncated}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]web_scrape error:[/red] {e}")
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
    console.print(f"      [cyan]linkedin_lookup[/cyan] {name} ({company or 'no company'})")

    try:
        from scout.linkedin import scrape_linkedin
        result = await scrape_linkedin(name, company, _current_login)
        duration = int((time.time() - start) * 1000)

        if result:
            if _current_conn and _current_login:
                db.upsert_linkedin_profile(_current_conn, _current_login, result)
                _current_conn.commit()
                console.print(f"      [dim]→ persisted LinkedInProfile[/dim]")

            text = json.dumps(result, indent=2, default=str)
            console.print(f"      [green]ok[/green] ({duration}ms) {result.get('headline', 'found')}")
            _log("linkedin_lookup", args, result, duration)
            return {"content": [{"type": "text", "text": text}]}
        else:
            console.print(f"      [dim]not found[/dim] ({duration}ms)")
            if _current_conn and _current_login:
                db.upsert_linkedin_profile(_current_conn, _current_login, {})
                _current_conn.commit()
            _log("linkedin_lookup", args, None, duration, "not found")
            return {"content": [{"type": "text", "text": "LinkedIn profile not found."}]}

    except Exception as e:
        duration = int((time.time() - start) * 1000)
        console.print(f"      [red]linkedin_lookup error:[/red] {e}")
        _log("linkedin_lookup", args, None, duration, str(e))
        return {"content": [{"type": "text", "text": f"LinkedIn error: {e}"}], "is_error": True}


# ─── MCP Server ──────────────────────────────────────────────────────────────

enrichment_mcp_server = create_sdk_mcp_server(
    name="tools",
    version="1.0.0",
    tools=[gh_query, web_search, web_scrape, linkedin_lookup],
)
