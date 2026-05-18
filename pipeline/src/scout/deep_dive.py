import asyncio
import json
import subprocess
from typing import Any

from claude_agent_sdk import (
    tool, create_sdk_mcp_server, query, ClaudeAgentOptions,
    ResultMessage, AssistantMessage, ToolUseBlock,
)
from rich.console import Console

from scout import db
from scout.config import DB_PATH

console = Console()


@tool(
    "gh_query",
    "Run a GitHub API query using the gh CLI. Returns JSON.",
    {
        "type": "object",
        "properties": {
            "endpoint": {"type": "string", "description": "GitHub API path, e.g. '/users/octocat'"},
            "jq_filter": {"type": "string", "description": "Optional jq filter"},
        },
        "required": ["endpoint"],
    },
)
async def gh_query(args: dict[str, Any]) -> dict[str, Any]:
    cmd = ["gh", "api", args["endpoint"]]
    jq_filter = args.get("jq_filter")
    if jq_filter:
        cmd.extend(["--jq", jq_filter])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return {"content": [{"type": "text", "text": f"Error: {result.stderr[:500]}"}], "is_error": True}
        return {"content": [{"type": "text", "text": result.stdout[:10000] or "(empty)"}]}
    except subprocess.TimeoutExpired:
        return {"content": [{"type": "text", "text": "gh api call timed out"}], "is_error": True}


github_server = create_sdk_mcp_server(name="github", version="1.0.0", tools=[gh_query])


async def run_deep_dive(login: str) -> str:
    conn = db.connect(DB_PATH)
    bundle = db.get_candidate_bundle(conn, login)
    context = json.dumps(bundle, default=str)[:5000] if bundle else f"No existing data for {login}"

    final_result = None
    async for message in query(
        prompt=(
            f"Deep-dive research on GitHub developer '{login}'. "
            f"Existing data:\n{context}\n\n"
            f"Use gh_query to investigate: repos, READMEs, commits, contributions, gists. "
            f"Produce a comprehensive profile."
        ),
        options=ClaudeAgentOptions(
            system_prompt="You are a senior engineering talent researcher. Make multiple gh_query calls.",
            mcp_servers={"github": github_server},
            allowed_tools=["mcp__github__gh_query"],
            max_turns=25,
        ),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    console.print(f"  [dim]gh api {block.input.get('endpoint', '')}[/dim]")
        elif isinstance(message, ResultMessage) and message.subtype == "success":
            final_result = message.result

    if final_result:
        existing = conn.execute("SELECT promptVersion FROM Profile WHERE candidateLogin = ?", (login,)).fetchone()
        version = (existing[0] + 1) if existing else 1
        db.upsert_profile(conn, login, {
            "summary": final_result[:2000],
            "model": "claude-agent-sdk-deep-dive",
            "confidence": 0.9, "seniority": "unknown", "fit_score": 3,
            "fit_reasoning": "Deep-dive — see summary",
            "recommended_outreach": "maybe", "outreach_reason": "Requires human review",
            "signals": [], "skills": [],
        }, prompt_version=version)
        conn.commit()
        console.print(f"[green]Profile updated for {login} (v{version})[/green]")

    conn.close()
    return final_result or "No result produced"
