import asyncio
import sqlite3
import time

from rich.console import Console

from scout import db
from scout.linkedin import scrape_linkedin
from scout.web_search import search_and_scrape

console = Console()

LINKEDIN_DELAY_SECONDS = 5


def web_enrich_candidate(conn: sqlite3.Connection, login: str) -> bool:
    candidate = conn.execute(
        "SELECT login, name, company FROM Candidate WHERE login = ?", (login,)
    ).fetchone()
    if not candidate:
        return False

    name = candidate["name"]
    company = candidate["company"]
    success = False

    # LinkedIn via Stagehand
    try:
        li_data = asyncio.run(scrape_linkedin(name, company, login))
        if li_data:
            db.upsert_linkedin_profile(conn, login, li_data)
            console.print(f"  [green]{login}[/green] LinkedIn: {li_data.get('headline', 'found')}")
            success = True
        else:
            db.upsert_linkedin_profile(conn, login, {})
            console.print(f"  [dim]{login}[/dim] LinkedIn: not found")
    except Exception as e:
        console.print(f"  [yellow]{login} LinkedIn error: {e}[/yellow]")
        db.upsert_linkedin_profile(conn, login, {})

    # Web search via Firecrawl
    try:
        mentions = search_and_scrape(name, login)
        if mentions:
            db.insert_web_mentions(conn, login, mentions)
            console.print(f"  [green]{login}[/green] Web: {len(mentions)} mentions")
            success = True
        else:
            console.print(f"  [dim]{login}[/dim] Web: no mentions")
    except Exception as e:
        console.print(f"  [yellow]{login} Web search error: {e}[/yellow]")

    conn.commit()
    return success
