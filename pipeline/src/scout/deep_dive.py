import asyncio
from scout.enrich import enrich_candidate


async def run_deep_dive(login: str) -> str:
    result = enrich_candidate(login)
    return f"Enriched {login}: {result['tool_calls']} tool calls in {result['duration_ms']/1000:.1f}s"
