from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from scout import db, pipeline
from scout.config import DB_PATH

app = typer.Typer(help="Talent Scout — GitHub fork profiler pipeline")
console = Console()


@app.command()
def fetch_forks():
    """Fetch all forks of willchen96/mike and store as Candidate rows."""
    count = pipeline.run_fetch_forks()
    console.print(f"[bold green]Done.[/bold green] {count} forks ingested.")


@app.command()
def enrich(limit: Optional[int] = typer.Option(None, help="Max candidates to enrich")):
    """Enrich candidates with GitHub profile, repos, and events."""
    count = pipeline.run_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates enriched.")


@app.command()
def web_enrich(limit: Optional[int] = typer.Option(None, help="Max candidates")):
    """Enrich candidates with LinkedIn and web presence data."""
    count = pipeline.run_web_enrich(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates web-enriched.")


@app.command()
def analyze(limit: Optional[int] = typer.Option(None, help="Max candidates to analyze")):
    """Analyze candidates with Claude Opus 4.7 (with live web tools)."""
    count = pipeline.run_analyze(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates analyzed.")


@app.command()
def run():
    """Run full pipeline: fetch-forks -> enrich -> web-enrich -> analyze."""
    pipeline.run_full_pipeline()
    console.print("[bold green]Full pipeline complete.[/bold green]")


@app.command()
def deep_dive(login: str = typer.Argument(help="GitHub login to deep-dive")):
    """Deep-dive a single candidate using Claude Agent SDK."""
    import asyncio
    from scout.deep_dive import run_deep_dive
    result = asyncio.run(run_deep_dive(login))
    console.print(result)


@app.command()
def stats():
    """Print pipeline statistics."""
    conn = db.connect(DB_PATH)
    s = db.get_stats(conn)
    conn.close()

    table = Table(title="Talent Scout Stats")
    table.add_column("Metric", style="cyan")
    table.add_column("Count", justify="right", style="green")

    table.add_row("Total candidates", str(s["candidates"]))
    table.add_row("GitHub enriched", str(s["enriched"]))
    table.add_row("Web enriched", str(s["web_enriched"]))
    table.add_row("Analyzed", str(s["analyzed"]))
    table.add_row("", "")
    for status in ["new", "reviewing", "interested", "contacted", "passed", "hired"]:
        table.add_row(f"Status: {status}", str(s[status]))

    console.print(table)
