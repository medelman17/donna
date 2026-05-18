import json
import subprocess
from typing import Any

from scout.cache import cache_get, cache_set


def gh_api(endpoint: str, paginate: bool = False, use_cache: bool = True) -> Any:
    cache_key = f"{'pag_' if paginate else ''}{endpoint}"
    if use_cache:
        cached = cache_get("gh", cache_key)
        if cached is not None:
            return cached

    cmd = ["gh", "api", endpoint, "--header", "Accept: application/vnd.github+json"]
    if paginate:
        cmd.append("--paginate")

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"gh api failed: {result.stderr.strip()}")

    text = result.stdout.strip()
    if paginate:
        data = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            parsed = json.loads(line)
            if isinstance(parsed, list):
                data.extend(parsed)
            else:
                data.append(parsed)
    else:
        data = json.loads(text)

    if use_cache:
        cache_set("gh", cache_key, data, ttl=3600)
    return data


def fetch_forks(repo: str) -> list[dict]:
    return gh_api(f"repos/{repo}/forks?sort=newest&per_page=100", paginate=True)


def fetch_user(login: str) -> dict:
    return gh_api(f"users/{login}")


def fetch_user_repos(login: str, limit: int = 10) -> list[dict]:
    repos = gh_api(f"users/{login}/repos?sort=updated&per_page=30")
    repos.sort(key=lambda r: r.get("stargazers_count", 0), reverse=True)
    return repos[:limit]


def fetch_user_events(login: str) -> list[dict]:
    return gh_api(f"users/{login}/events/public?per_page=30")


def fetch_issues(repo: str, state: str = "all") -> list[dict]:
    return gh_api(f"repos/{repo}/issues?state={state}&per_page=100", paginate=True)


def fetch_pulls(repo: str, state: str = "all") -> list[dict]:
    return gh_api(f"repos/{repo}/pulls?state={state}&per_page=100", paginate=True)


def fetch_contributors(repo: str) -> list[dict]:
    try:
        return gh_api(f"repos/{repo}/contributors?per_page=100", paginate=True)
    except RuntimeError:
        return []


def fetch_stargazers(repo: str) -> list[dict]:
    try:
        return gh_api(f"repos/{repo}/stargazers?per_page=100", paginate=True)
    except RuntimeError:
        return []


def fetch_compare(owner: str, repo: str, base: str, head: str) -> dict | None:
    try:
        return gh_api(f"repos/{owner}/{repo}/compare/{base}...{head}", use_cache=True)
    except RuntimeError:
        return None
