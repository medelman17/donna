import asyncio
import json
import time
from typing import Any

from claude_agent_sdk import (
    query, ClaudeAgentOptions,
    ResultMessage, AssistantMessage, ToolUseBlock,
)
from rich.console import Console

from scout import db
from scout.tools import enrichment_mcp_server, set_context

console = Console()

ENRICHMENT_SYSTEM_PROMPT = """You are a talent research agent. Your job is to build a comprehensive profile of a software developer who forked an open-source AI legal platform (willchen96/mike on GitHub).

You have four tools:
- gh_query: Pull data from the GitHub API (profile, repos, events, READMEs)
- web_search: Search Google for the person
- web_scrape: Extract content from a specific URL
- linkedin_lookup: Find and extract their LinkedIn profile

WORKFLOW:
1. Start by pulling their GitHub profile: gh_query endpoint="/users/{login}"
2. Pull their top repos: gh_query endpoint="/users/{login}/repos?sort=stars&per_page=10"
3. Pull recent activity: gh_query endpoint="/users/{login}/events/public?per_page=30"
4. Read what you found carefully. Note their:
   - Real name, bio, company, location
   - Blog URL or personal site (scrape it directly if present)
   - Twitter handle
   - Top languages and notable repos
   - Any clues about their professional identity

5. Based on what you learned, search the web intelligently:
   - If they have a personal blog/site → web_scrape it
   - If their bio mentions a job title → search LinkedIn for "{name}" "{title}" "{company}"
   - Search for conference talks: "{name}" (speaker OR talk OR conference) {primary_language}
   - Search for blog posts: "{name}" (blog OR article OR wrote) {domain_expertise}

6. For promising search results, scrape the actual pages to get content

7. If you have a name + company or title, try linkedin_lookup

BE SMART:
- Don't search for people with no name and no bio — there's nothing to find
- If their GitHub is mostly forks with no own work, note that and move on quickly
- Blog URLs in the GitHub profile are the highest-value signal — always scrape those
- A bio like "Senior AI Engineer at Google" gives you everything for LinkedIn
- Don't make redundant searches
- Quality over quantity — 3 good findings beat 10 empty results
- Report what you found at the end as a summary"""


def enrich_candidate(login: str) -> dict[str, Any]:
    conn = db.connect()
    set_context(login, conn)
    start = time.time()

    console.print()
    console.rule(f"[bold]Enriching: {login}[/bold]", style="cyan")

    final_result = None
    tool_calls = 0

    try:
        for message in asyncio.get_event_loop().run_until_complete(_run_agent(login)):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        tool_calls += 1
            elif isinstance(message, ResultMessage) and message.subtype == "success":
                final_result = message.result
    except RuntimeError:
        # No running event loop — create one
        final_result = asyncio.run(_run_agent_collect(login))

    duration = int((time.time() - start) * 1000)

    console.print(f"\n  [bold green]Done[/bold green] — {tool_calls} tool calls in {duration/1000:.1f}s")
    if final_result:
        console.print(f"  [dim]{final_result[:200]}...[/dim]")

    conn.close()
    return {"login": login, "tool_calls": tool_calls, "duration_ms": duration}


async def _run_agent_collect(login: str) -> str | None:
    final = None
    async for message in _run_agent_stream(login):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            final = message.result
    return final


async def _run_agent_stream(login: str):
    async for message in query(
        prompt=(
            f"Research the GitHub developer '{login}' who forked willchen96/mike "
            f"(an AI legal platform). Start by pulling their GitHub data, then "
            f"use what you find to search the web for their professional presence."
        ),
        options=ClaudeAgentOptions(
            system_prompt=ENRICHMENT_SYSTEM_PROMPT,
            mcp_servers={"tools": enrichment_mcp_server},
            allowed_tools=[
                "mcp__tools__gh_query",
                "mcp__tools__web_search",
                "mcp__tools__web_scrape",
                "mcp__tools__linkedin_lookup",
            ],
            max_turns=30,
        ),
    ):
        yield message


# For the event loop issue, provide a sync wrapper
async def _run_agent(login: str):
    results = []
    async for msg in _run_agent_stream(login):
        results.append(msg)
    return results
