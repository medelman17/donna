import warnings
warnings.filterwarnings("ignore", message="Field name.*shadows an attribute in parent")

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from scout import db, pipeline
from scout.cache import cache_stats

app = typer.Typer(help="Talent Scout — GitHub fork profiler pipeline")
console = Console()


@app.command()
def fetch_forks():
    """Fetch all forks of willchen96/mike and store as Candidate rows."""
    count = pipeline.run_fetch_forks()
    console.print(f"[bold green]Done.[/bold green] {count} forks ingested.")


@app.command()
def enrich(
    limit: Optional[int] = typer.Option(None, help="Max candidates to enrich"),
    force: bool = typer.Option(False, "--force", "-f", help="Re-enrich even if already enriched"),
    login: Optional[str] = typer.Option(None, "--login", "-l", help="Enrich a specific candidate"),
):
    """Agent-driven enrichment (GitHub + web + LinkedIn) per candidate."""
    if login:
        from scout.enrich import enrich_candidate
        result = enrich_candidate(login)
        console.print(f"[bold green]Done.[/bold green] {result['tool_calls']} tool calls.")
    else:
        count = pipeline.run_enrich(limit, force=force)
        console.print(f"[bold green]Done.[/bold green] {count} candidates enriched.")


@app.command()
def analyze(limit: Optional[int] = typer.Option(None, help="Max candidates to analyze")):
    """Analyze candidates with Claude Opus 4.7 (with live web tools)."""
    count = pipeline.run_analyze(limit)
    console.print(f"[bold green]Done.[/bold green] {count} candidates analyzed.")


@app.command()
def run():
    """Run full pipeline: fetch-forks -> enrich -> analyze."""
    pipeline.run_full_pipeline()
    console.print("[bold green]Full pipeline complete.[/bold green]")


@app.command()
def deep_dive(login: str = typer.Argument(help="GitHub login to re-enrich")):
    """Re-run agent enrichment for a single candidate."""
    from scout.enrich import enrich_candidate
    result = enrich_candidate(login)
    console.print(f"[bold green]Done.[/bold green] {result['tool_calls']} tool calls.")


@app.command()
def stats():
    """Print pipeline statistics."""
    conn = db.connect()
    s = db.get_stats(conn)
    conn.close()

    table = Table(title="Talent Scout Stats")
    table.add_column("Metric", style="cyan")
    table.add_column("Count", justify="right", style="green")

    table.add_row("Total candidates", str(s["candidates"]))
    table.add_row("Enriched (have repos)", str(s["enriched"]))
    table.add_row("Analyzed (have profile)", str(s["analyzed"]))
    table.add_row("Tool calls logged", str(s["tool_calls"]))
    table.add_row("", "")
    for status in ["new", "reviewing", "interested", "contacted", "passed", "hired"]:
        table.add_row(f"Status: {status}", str(s[status]))

    # Redis cache stats
    try:
        cs = cache_stats()
        if cs:
            table.add_row("", "")
            table.add_row("[bold]Redis Cache[/bold]", "")
            for ns, count in sorted(cs.items()):
                table.add_row(f"  {ns}", str(count))
    except Exception:
        pass

    console.print(table)
