from typing import Any

from firecrawl import FirecrawlApp
from rich.console import Console
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from scout.config import get_firecrawl_key

console = Console()


class FirecrawlRetryable(Exception):
    pass


@retry(
    retry=retry_if_exception_type(FirecrawlRetryable),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
)
def _search(app: FirecrawlApp, query: str, limit: int = 10) -> list[dict]:
    try:
        results = app.search(query, params={"limit": limit})
        if isinstance(results, list):
            return results
        if isinstance(results, dict) and "data" in results:
            return results["data"]
        return []
    except Exception as e:
        if "429" in str(e) or "rate" in str(e).lower():
            raise FirecrawlRetryable(str(e)) from e
        raise


@retry(
    retry=retry_if_exception_type(FirecrawlRetryable),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(3),
)
def _scrape(app: FirecrawlApp, url: str) -> dict | None:
    try:
        result = app.scrape_url(url, params={"formats": ["markdown"]})
        if isinstance(result, dict):
            return result
        return None
    except Exception as e:
        if "429" in str(e) or "rate" in str(e).lower():
            raise FirecrawlRetryable(str(e)) from e
        console.print(f"  [yellow]Scrape failed for {url}: {e}[/yellow]")
        return None


def search_and_scrape(
    name: str | None, login: str, limit: int = 5
) -> list[dict[str, Any]]:
    app = FirecrawlApp(api_key=get_firecrawl_key())

    query_parts = []
    if name:
        query_parts.append(f'"{name}"')
    query_parts.append(login)
    query_parts.append("developer")
    query = " ".join(query_parts)

    results = _search(app, query, limit=limit * 2)

    mentions = []
    for r in results:
        url = r.get("url", "")
        if not url or "github.com" in url:
            continue
        if len(mentions) >= limit:
            break

        title = r.get("title") or r.get("metadata", {}).get("title", "")
        snippet = r.get("description") or r.get("metadata", {}).get("description", "")

        content = r.get("markdown", "")
        if not content:
            scraped = _scrape(app, url)
            if scraped:
                content = scraped.get("markdown", "")

        if len(content) < 100:
            continue

        source = "google"
        url_lower = url.lower()
        if "blog" in url_lower or "medium.com" in url_lower or "dev.to" in url_lower:
            source = "blog"
        elif "conference" in url_lower or "speaker" in url_lower or "talk" in url_lower:
            source = "conference"

        mentions.append({
            "url": url,
            "title": title[:200],
            "snippet": snippet[:300],
            "source": source,
            "content": content[:5000],
        })

    return mentions
