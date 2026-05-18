import sqlite3
from typing import Any

from scout import github, db
from scout.config import FORK_REPO


def enrich_candidate(conn: sqlite3.Connection, login: str) -> None:
    user = github.fetch_user(login)
    db.upsert_candidate(conn, user)

    repos = github.fetch_user_repos(login)
    db.insert_repos(conn, login, repos)

    events = github.fetch_user_events(login)
    db.insert_events(conn, login, events)

    fork_meta = _build_fork_meta(login)
    if fork_meta:
        db.upsert_fork_meta(conn, login, fork_meta)

    db.ensure_crm(conn, login)
    conn.commit()


def _build_fork_meta(login: str) -> dict[str, Any] | None:
    compare = github.fetch_compare(
        FORK_REPO.split("/")[0],
        FORK_REPO.split("/")[1],
        "main",
        f"{login}:main",
    )
    if not compare:
        return None
    return {
        "ahead_by": compare.get("ahead_by", 0),
        "behind_by": compare.get("behind_by", 0),
        "has_own_commits": compare.get("ahead_by", 0) > 0,
    }
