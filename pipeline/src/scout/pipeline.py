import time

from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, MofNCompleteColumn
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from scout import db, github
from scout.config import FORK_REPO
from scout.enrich import enrich_candidate
from scout.analyze import analyze_candidate

console = Console()


class RetryableError(Exception):
    pass


def run_fetch_forks() -> int:
    conn = db.connect()
    forks = github.fetch_forks(FORK_REPO)
    console.print(f"[bold]Fetched {len(forks)} forks[/bold]")

    for fork in forks:
        owner = fork.get("owner", {})
        candidate = {
            "login": owner.get("login"),
            "avatar_url": owner.get("avatar_url"),
            "html_url": owner.get("html_url"),
        }
        if not candidate["login"]:
            continue
        db.upsert_candidate(conn, candidate)
        db.upsert_fork_meta(conn, candidate["login"], fork)

    conn.commit()
    conn.close()
    return len(forks)


def run_enrich(limit: int | None = None) -> int:
    conn = db.connect()
    logins = db.get_unenriched_logins(conn, limit)
    conn.close()
    console.print(f"[bold]Agent-enriching {len(logins)} candidates[/bold]\n")

    enriched = 0
    for i, login in enumerate(logins, 1):
        console.print(f"[bold]── Candidate {i}/{len(logins)} ──[/bold]")
        try:
            result = enrich_candidate(login)
            enriched += 1
            console.print(
                f"  [green]{login}[/green] — {result['tool_calls']} tools, "
                f"{result['duration_ms']/1000:.1f}s"
            )
        except Exception as e:
            console.print(f"  [red]{login} failed: {e}[/red]")
        console.print()

    console.print(f"\n[bold]Enrichment complete: {enriched}/{len(logins)} candidates[/bold]")
    return enriched


@retry(
    retry=retry_if_exception_type(RetryableError),
    wait=wait_exponential(multiplier=2, min=4, max=120),
    stop=stop_after_attempt(3),
)
def _analyze_with_retry(bundle: dict) -> dict | None:
    try:
        conn = db.connect()
        result = analyze_candidate(conn, bundle)
        conn.close()
        return result
    except Exception as e:
        err = str(e).lower()
        if "429" in err or "overloaded" in err or "rate" in err or "529" in err:
            raise RetryableError(str(e)) from e
        raise


def run_analyze(limit: int | None = None) -> int:
    conn = db.connect()
    logins = db.get_unanalyzed_logins(conn, limit)
    console.print(f"[bold]Analyzing {len(logins)} candidates with Claude[/bold]")

    analyzed = 0
    total_input = 0
    total_output = 0

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                  BarColumn(), MofNCompleteColumn(), console=console) as progress:
        task = progress.add_task("Analyzing...", total=len(logins))
        for login in logins:
            bundle = db.get_candidate_bundle(conn, login)
            if not bundle:
                progress.advance(task)
                continue
            try:
                result = _analyze_with_retry(bundle)
                if result:
                    analyzed += 1
                    total_input += result.get("input_tokens", 0)
                    total_output += result.get("output_tokens", 0)
                    progress.console.print(
                        f"  [green]{login}[/green] fit={result.get('fit_score')} "
                        f"in={result.get('input_tokens')} out={result.get('output_tokens')}"
                    )
            except Exception as e:
                console.print(f"[red]Failed to analyze {login}: {e}[/red]")
            progress.advance(task)

    conn.close()
    console.print(f"\n[bold]Analyzed {analyzed} candidates[/bold]")
    console.print(f"Tokens — input: {total_input}, output: {total_output}")
    return analyzed


def run_full_pipeline() -> None:
    run_fetch_forks()
    run_enrich()
    run_analyze()
