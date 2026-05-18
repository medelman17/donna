import json
import subprocess
from pathlib import Path
from typing import Any

from scout.config import CACHE_DIR


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "__").replace("?", "_q_").replace("&", "_a_")
    return CACHE_DIR / f"{safe}.json"


def _read_cache(key: str) -> Any | None:
    p = _cache_path(key)
    if p.exists():
        return json.loads(p.read_text())
    return None


def _write_cache(key: str, data: Any) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(key).write_text(json.dumps(data))


def gh_api(endpoint: str, paginate: bool = False, use_cache: bool = True) -> Any:
    cache_key = f"{'pag_' if paginate else ''}{endpoint}"
    if use_cache:
        cached = _read_cache(cache_key)
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
        _write_cache(cache_key, data)
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


def fetch_compare(owner: str, repo: str, base: str, head: str) -> dict | None:
    try:
        return gh_api(f"repos/{owner}/{repo}/compare/{base}...{head}", use_cache=True)
    except RuntimeError:
        return None
