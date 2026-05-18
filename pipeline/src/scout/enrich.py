import asyncio
import time
from typing import Any
from collections import deque

from claude_agent_sdk import (
    query, ClaudeAgentOptions,
    ResultMessage, AssistantMessage, ToolUseBlock, TextBlock,
)
from rich.console import Console, Group
from rich.live import Live
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from scout import db
from scout.events import publish
from scout.tools import enrichment_mcp_server, set_context

console = Console()

ENRICHMENT_SYSTEM_PROMPT = """You are a talent research agent. Your job is to build a comprehensive profile of a software developer who forked an open-source AI legal platform (willchen96/mike on GitHub).

You have six tools:
- gh_query: Pull data from the GitHub API (profile, repos, events, READMEs)
- web_search: Search Google for the person
- web_scrape: Extract content from a specific URL
- linkedin_lookup: Find and extract their LinkedIn profile
- technical_assess: Dispatch a subagent to read actual source code from their best repos and evaluate code quality, architecture, and engineering maturity. Use this when you find 1-3 interesting ORIGINAL (non-fork) repos worth a deeper look.
- legal_relevance_assess: Dispatch a subagent to investigate the candidate's connection to the legal/legal-tech space. Use this for every candidate — it searches for legal industry experience, law-adjacent projects, compliance work, regulatory tech, court/litigation tools, contract analysis, legal AI, etc.

WORKFLOW:
1. Start by pulling their GitHub profile: gh_query endpoint="/users/{login}"
2. Pull their most-starred repos: gh_query endpoint="/users/{login}/repos?sort=stars&direction=desc&per_page=10"
3. Pull their most recently updated repos: gh_query endpoint="/users/{login}/repos?sort=updated&per_page=10"
4. Pull recent activity: gh_query endpoint="/users/{login}/events/public?per_page=30"
5. Investigate their fork of willchen96/mike:
   - Check if they made commits: gh_query endpoint="/repos/{login}/mike/commits?per_page=5"
   - Compare with upstream: gh_query endpoint="/repos/willchen96/mike/compare/main...{login}:main"
   - If they have commits ahead, look at what they changed — this is the HIGHEST signal of genuine interest vs drive-by fork
   - Check if they opened any PRs back to the original: gh_query endpoint="/repos/willchen96/mike/pulls?state=all" jq_filter="[.[] | select(.user.login == \"{login}\")]"
6. Read what you found carefully. Note their:
   - Real name, bio, company, location
   - Blog URL or personal site (scrape it directly if present)
   - Twitter handle
   - Top languages and notable repos (look at BOTH starred and recent — starred shows their best work, recent shows what they're active on)
   - Any clues about their professional identity
   - For interesting repos, pull the README: gh_query endpoint="/repos/{owner}/{repo}/readme" jq_filter=".content" to understand what they built

6. Based on what you learned, search the web intelligently:
   - If they have a personal blog/site → web_scrape it
   - If their bio mentions a job title → search LinkedIn for "{name}" "{title}" "{company}"
   - Search for conference talks: "{name}" (speaker OR talk OR conference) {primary_language}
   - Search for blog posts: "{name}" (blog OR article OR wrote) {domain_expertise}

7. For promising search results, scrape the actual pages to get content

8. If you have a name + company or title, try linkedin_lookup

9. ALWAYS run legal_relevance_assess for every candidate. Pass their login and whatever context you've gathered (name, company, bio, repo descriptions). Understanding their connection to legal tech is the PRIMARY purpose of this research — they forked an AI legal platform, and we need to know if that was intentional or incidental.

10. If you found interesting original repos, run technical_assess on the top 1-3

BE SMART:
- Don't search for people with no name and no bio — there's nothing to find
- If their GitHub is mostly forks with no own work, note that and move on quickly
- Blog URLs in the GitHub profile are the highest-value signal — always scrape those
- A bio like "Senior AI Engineer at Google" gives you everything for LinkedIn
- Don't make redundant searches
- Quality over quantity — 3 good findings beat 10 empty results
- NEVER use web_scrape on linkedin.com URLs — LinkedIn blocks scrapers. Use the linkedin_lookup tool instead, which uses a stealth browser
- web_scrape works great for blogs, personal sites, conference pages, Stack Overflow, Twitter/X profiles, etc. — just not LinkedIn
- If their GitHub profile has a twitter handle, try scraping their X profile: web_scrape url="https://x.com/{handle}" — developer Twitter bios and pinned tweets are high-signal

COMPOUND YOUR KNOWLEDGE:
Every source you check may reveal new leads. Treat this as an investigation, not a checklist:
- A GitHub repo README might mention a company, a co-author, or a related project → search for those
- A blog post might link to a talk recording, a podcast appearance, or a paper → follow those leads
- A web search result snippet might reveal an employer, a university, or a community → refine your next search
- Git commit emails reveal real names and sometimes personal domains
- NPM/PyPI package pages often list author info, homepages, and funding links
- Conference speaker pages list bios, social links, and talk abstracts
- If you find a personal domain (e.g. from their GitHub blog field), scrape it — personal sites are goldmines for professional history
- Stack Overflow profiles linked from GitHub show expertise areas
- If someone contributes to well-known open source projects, mention which ones — that's a strong signal

BUILD A MENTAL MODEL as you go. After each tool call, update your understanding of who this person is: what's their specialty, what level are they at, what communities are they in, what's their career trajectory? Use that model to decide what to search next.

IMPORTANT: Think out loud as you work. Before each tool call, briefly explain what you're doing and WHY — what lead are you following? After reviewing results, share what new information you learned and what leads it opened up. At the end, provide a comprehensive summary."""


class EnrichmentDisplay:
    def __init__(self, login: str):
        self.login = login
        self.reasoning_history: list[str] = []
        self.tool_log: deque[str] = deque(maxlen=6)
        self.tool_calls = 0
        self.steps = 0
        self.start = time.time()
        self.status = "Starting..."
        self.data_persisted: list[str] = []

    def set_reasoning(self, text: str) -> None:
        self.steps += 1
        self.reasoning_history.append(text[:1500])
        self.status = f"Step {self.steps} — reasoning"

    def add_tool_call(self, tool: str, detail: str, duration_ms: int = 0, ok: bool = True) -> None:
        self.tool_calls += 1
        icon = "[green]✓[/green]" if ok else "[red]✗[/red]"
        line = f"{icon} {tool} {detail}"
        if duration_ms:
            line += f" [dim]({duration_ms}ms)[/dim]"
        self.tool_log.append(line)
        self.status = f"Step {self.steps} — {tool}"

    def add_persist(self, what: str) -> None:
        if what not in self.data_persisted:
            self.data_persisted.append(what)

    def render(self) -> Panel:
        elapsed = time.time() - self.start
        term_h = console.height or 40
        tool_h = min(10, max(4, len(self.tool_log) + 2))
        # reasoning gets everything except status(2) + tools + chrome(6)
        reasoning_h = max(8, term_h - tool_h - 8)

        # Status bar
        saved = ", ".join(self.data_persisted) if self.data_persisted else "—"
        status = Text.from_markup(
            f"  [bold cyan]{self.login}[/bold cyan]  ·  "
            f"{self.tool_calls} tools  ·  {self.steps} steps  ·  {elapsed:.0f}s  ·  "
            f"Saved: [green]{saved}[/green]"
        )

        # Build full reasoning history as one markdown doc
        parts = []
        for i, text in enumerate(self.reasoning_history, 1):
            parts.append(f"**Step {i}**\n\n{text}")
        full_md = "\n\n---\n\n".join(parts) if parts else "*Thinking...*"

        # Render markdown to text lines, then take the LAST ones that fit
        from io import StringIO
        from rich.console import Console as OffscreenConsole
        buf = StringIO()
        off = OffscreenConsole(file=buf, width=(console.width or 100) - 6, force_terminal=True)
        try:
            off.print(Markdown(full_md))
        except Exception:
            off.print(full_md)
        rendered_lines = buf.getvalue().split("\n")

        # Keep the last N lines that fit in the reasoning panel
        visible_lines = reasoning_h - 2  # account for panel border
        if len(rendered_lines) > visible_lines:
            shown = rendered_lines[-visible_lines:]
            # Prepend scroll indicator
            hidden = len(rendered_lines) - visible_lines
            shown[0] = f"  ↑ {hidden} more lines above ↑"
        else:
            shown = rendered_lines

        reasoning_panel = Panel(
            Text.from_ansi("\n".join(shown)),
            title=f"[cyan]Agent ({self.steps} steps)[/cyan]",
            border_style="cyan",
            padding=(0, 1),
            height=reasoning_h,
        )

        # Tool log
        tool_lines = Text()
        for line in self.tool_log:
            tool_lines.append_text(Text.from_markup(line))
            tool_lines.append("\n")

        tool_panel = Panel(
            tool_lines if self.tool_log else Text("Waiting for tool calls...", style="dim"),
            title=f"[yellow]Tools ({self.tool_calls})[/yellow]",
            border_style="dim",
            padding=(0, 1),
            height=tool_h,
        )

        return Panel(
            Group(status, "", reasoning_panel, "", tool_panel),
            title=f"[bold]Enriching[/bold]",
            subtitle=f"[dim]{self.status}[/dim]",
            border_style="cyan",
            padding=(0, 1),
            height=term_h - 2,
        )


# Module-level display for tool callbacks
_display: EnrichmentDisplay | None = None


def get_display() -> EnrichmentDisplay | None:
    return _display


def enrich_candidate(login: str) -> dict[str, Any]:
    global _display
    conn = db.connect()
    set_context(login, conn)

    display = EnrichmentDisplay(login)
    _display = display

    console.print()

    final_text = None

    with Live(display.render(), console=console, refresh_per_second=4, screen=True) as live:
        async def run():
            nonlocal final_text
            async for message in query(
                prompt=(
                    f"Research the GitHub developer '{login}' who forked willchen96/mike "
                    f"(an AI legal platform). Start by pulling their GitHub data, then "
                    f"use what you find to search the web for their professional presence. "
                    f"Think out loud as you work — explain what you're doing and what you find."
                ),
                options=ClaudeAgentOptions(
                    system_prompt=ENRICHMENT_SYSTEM_PROMPT,
                    mcp_servers={"tools": enrichment_mcp_server},
                    allowed_tools=[
                        "mcp__tools__gh_query",
                        "mcp__tools__web_search",
                        "mcp__tools__web_scrape",
                        "mcp__tools__linkedin_lookup",
                        "mcp__tools__technical_assess",
                        "mcp__tools__legal_relevance_assess",
                    ],
                    max_turns=40,
                ),
            ):
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            text = block.text.strip()
                            if text:
                                display.set_reasoning(text)
                                publish(login, "reasoning", {"step": display.steps, "text": text})
                                live.update(display.render())
                        elif isinstance(block, ToolUseBlock):
                            display.tool_calls += 1
                            live.update(display.render())

                elif isinstance(message, ResultMessage):
                    if message.subtype == "success":
                        final_text = message.result
                        if final_text:
                            publish(login, "summary", {"text": final_text})
                    elif message.subtype == "error":
                        display.status = f"Error: {message.result}"
                        live.update(display.render())

        asyncio.run(run())

    _display = None
    duration = int((time.time() - display.start) * 1000)

    # Print persistent summary after Live clears
    console.rule(f"[bold green]{login}[/bold green] — {display.tool_calls} tools, {display.steps} steps, {duration/1000:.1f}s", style="green")

    if final_text:
        try:
            summary_content = Markdown(final_text[:2000])
        except Exception:
            summary_content = Text(final_text[:2000])
        console.print(Panel(
            summary_content,
            title="[bold green]Summary[/bold green]",
            border_style="green",
            padding=(0, 1),
            width=min(console.width, 100),
        ))

    if display.data_persisted:
        console.print(f"  Saved: {', '.join(display.data_persisted)}")

    console.print()

    result = {"login": login, "tool_calls": display.tool_calls, "steps": display.steps, "duration_ms": duration}
    publish(login, "done", {"tool_calls": result["tool_calls"], "steps": result["steps"], "duration_ms": duration})

    conn.close()
    return result
