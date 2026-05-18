import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


# --- Candidate ---

def upsert_candidate(conn: sqlite3.Connection, c: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO Candidate
           (login, name, bio, location, company, blog, twitter,
            hireable, followers, publicRepos, avatarUrl, htmlUrl,
            githubCreatedAt, fetchedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(login) DO UPDATE SET
             name=excluded.name, bio=excluded.bio, location=excluded.location,
             company=excluded.company, blog=excluded.blog, twitter=excluded.twitter,
             hireable=excluded.hireable, followers=excluded.followers,
             publicRepos=excluded.publicRepos, avatarUrl=excluded.avatarUrl,
             htmlUrl=excluded.htmlUrl, githubCreatedAt=excluded.githubCreatedAt,
             fetchedAt=excluded.fetchedAt
        """,
        (
            c["login"], c.get("name"), c.get("bio"), c.get("location"),
            c.get("company"), c.get("blog"), c.get("twitter"),
            c.get("hireable"), c.get("followers", 0), c.get("public_repos", 0),
            c.get("avatar_url"), c.get("html_url"),
            c.get("created_at"), datetime.utcnow().isoformat(),
        ),
    )


# --- ForkMeta ---

def upsert_fork_meta(conn: sqlite3.Connection, login: str, f: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO ForkMeta
           (candidateLogin, forkHtmlUrl, forkPushedAt, forkStars,
            aheadBy, behindBy, hasOwnCommits, defaultBranch)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             forkHtmlUrl=excluded.forkHtmlUrl, forkPushedAt=excluded.forkPushedAt,
             forkStars=excluded.forkStars, aheadBy=excluded.aheadBy,
             behindBy=excluded.behindBy, hasOwnCommits=excluded.hasOwnCommits,
             defaultBranch=excluded.defaultBranch
        """,
        (
            login, f.get("html_url"), f.get("pushed_at"), f.get("stargazers_count", 0),
            f.get("ahead_by", 0), f.get("behind_by", 0),
            f.get("has_own_commits", False), f.get("default_branch"),
        ),
    )


# --- Repo ---

def insert_repos(conn: sqlite3.Connection, login: str, repos: list[dict]) -> None:
    conn.execute("DELETE FROM Repo WHERE candidateLogin = ?", (login,))
    for r in repos:
        conn.execute(
            """INSERT INTO Repo
               (candidateLogin, name, htmlUrl, description, language, stars, forks, pushedAt, isFork)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (login, r["name"], r["html_url"], r.get("description"),
             r.get("language"), r.get("stargazers_count", 0),
             r.get("forks_count", 0), r.get("pushed_at"), r.get("fork", False)),
        )


# --- Event ---

def insert_events(conn: sqlite3.Connection, login: str, events: list[dict]) -> None:
    conn.execute("DELETE FROM Event WHERE candidateLogin = ?", (login,))
    for e in events:
        conn.execute(
            "INSERT INTO Event (candidateLogin, type, repoName, createdAt, payload) VALUES (?, ?, ?, ?, ?)",
            (login, e["type"], e.get("repo", {}).get("name"),
             e["created_at"], json.dumps(e.get("payload", {}))[:2000]),
        )


# --- Profile ---

def upsert_profile(conn: sqlite3.Connection, login: str, p: dict[str, Any], prompt_version: int = 1) -> None:
    conn.execute(
        """INSERT INTO Profile
           (candidateLogin, summary, seniority, fitScore, fitReasoning,
            recommendedOutreach, outreachReason, confidence, model,
            promptVersion, generatedAt, rawJson)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             summary=excluded.summary, seniority=excluded.seniority,
             fitScore=excluded.fitScore, fitReasoning=excluded.fitReasoning,
             recommendedOutreach=excluded.recommendedOutreach,
             outreachReason=excluded.outreachReason,
             confidence=excluded.confidence, model=excluded.model,
             promptVersion=excluded.promptVersion,
             generatedAt=excluded.generatedAt, rawJson=excluded.rawJson
        """,
        (login, p.get("summary"), p.get("seniority"), p.get("fit_score"),
         p.get("fit_reasoning"), p.get("recommended_outreach"),
         p.get("outreach_reason"), p.get("confidence"),
         p.get("model"), prompt_version,
         datetime.utcnow().isoformat(), json.dumps(p)),
    )


# --- Signal / Skill ---

def insert_signals(conn: sqlite3.Connection, login: str, signals: list[dict]) -> None:
    conn.execute("DELETE FROM Signal WHERE candidateLogin = ?", (login,))
    for s in signals:
        conn.execute("INSERT INTO Signal (candidateLogin, kind, text) VALUES (?, ?, ?)",
                     (login, s["kind"], s["text"]))


def insert_skills(conn: sqlite3.Connection, login: str, skills: list[str]) -> None:
    conn.execute("DELETE FROM Skill WHERE candidateLogin = ?", (login,))
    for name in skills:
        conn.execute("INSERT INTO Skill (candidateLogin, name) VALUES (?, ?)", (login, name))


# --- Crm ---

def ensure_crm(conn: sqlite3.Connection, login: str) -> None:
    conn.execute(
        "INSERT INTO Crm (candidateLogin, status, updatedAt) VALUES (?, 'new', ?) ON CONFLICT(candidateLogin) DO NOTHING",
        (login, datetime.utcnow().isoformat()),
    )


# --- LinkedInProfile ---

def upsert_linkedin_profile(conn: sqlite3.Connection, login: str, data: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO LinkedInProfile
           (candidateLogin, profileUrl, headline, currentTitle, currentCompany,
            location, connectionCount, experience, education, skills, certifications, scrapedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidateLogin) DO UPDATE SET
             profileUrl=excluded.profileUrl, headline=excluded.headline,
             currentTitle=excluded.currentTitle, currentCompany=excluded.currentCompany,
             location=excluded.location, connectionCount=excluded.connectionCount,
             experience=excluded.experience, education=excluded.education,
             skills=excluded.skills, certifications=excluded.certifications,
             scrapedAt=excluded.scrapedAt
        """,
        (login, data.get("profile_url"), data.get("headline"),
         data.get("current_title"), data.get("current_company"),
         data.get("location"), data.get("connection_count"),
         json.dumps(data.get("experience", [])),
         json.dumps(data.get("education", [])),
         json.dumps(data.get("skills", [])),
         json.dumps(data.get("certifications", [])),
         datetime.utcnow().isoformat()),
    )


# --- WebMention ---

def insert_web_mentions(conn: sqlite3.Connection, login: str, mentions: list[dict]) -> None:
    conn.execute("DELETE FROM WebMention WHERE candidateLogin = ?", (login,))
    for m in mentions:
        conn.execute(
            """INSERT INTO WebMention (candidateLogin, url, title, snippet, source, content, scrapedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (login, m["url"], m.get("title"), m.get("snippet"),
             m.get("source", "google"), (m.get("content") or "")[:5000],
             datetime.utcnow().isoformat()),
        )


# --- Queries ---

def get_unenriched_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = "SELECT login FROM Candidate WHERE login NOT IN (SELECT candidateLogin FROM Repo) ORDER BY login"
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unweb_enriched_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM Candidate
             WHERE login IN (SELECT candidateLogin FROM Repo)
             AND login NOT IN (SELECT candidateLogin FROM LinkedInProfile)
             AND login NOT IN (SELECT DISTINCT candidateLogin FROM WebMention)
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unanalyzed_logins(conn: sqlite3.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM Candidate
             WHERE login NOT IN (SELECT candidateLogin FROM Profile)
             AND login IN (SELECT candidateLogin FROM Repo)
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_candidate_bundle(conn: sqlite3.Connection, login: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM Candidate WHERE login = ?", (login,)).fetchone()
    if not row:
        return None
    c = dict(row)
    c["repos"] = [dict(r) for r in conn.execute(
        "SELECT * FROM Repo WHERE candidateLogin = ? ORDER BY stars DESC LIMIT 10", (login,)).fetchall()]
    c["events"] = [dict(e) for e in conn.execute(
        "SELECT * FROM Event WHERE candidateLogin = ? ORDER BY createdAt DESC LIMIT 30", (login,)).fetchall()]
    fork = conn.execute("SELECT * FROM ForkMeta WHERE candidateLogin = ?", (login,)).fetchone()
    c["fork_meta"] = dict(fork) if fork else None
    li = conn.execute("SELECT * FROM LinkedInProfile WHERE candidateLogin = ?", (login,)).fetchone()
    c["linkedin"] = dict(li) if li else None
    c["web_mentions"] = [dict(w) for w in conn.execute(
        "SELECT * FROM WebMention WHERE candidateLogin = ? ORDER BY scrapedAt DESC", (login,)).fetchall()]
    return c


def get_stats(conn: sqlite3.Connection) -> dict[str, int]:
    def count(sql: str) -> int:
        return conn.execute(sql).fetchone()[0]
    return {
        "candidates": count("SELECT COUNT(*) FROM Candidate"),
        "enriched": count("SELECT COUNT(DISTINCT candidateLogin) FROM Repo"),
        "web_enriched": count("SELECT COUNT(DISTINCT candidateLogin) FROM LinkedInProfile"),
        "analyzed": count("SELECT COUNT(*) FROM Profile"),
        "new": count("SELECT COUNT(*) FROM Crm WHERE status = 'new'"),
        "reviewing": count("SELECT COUNT(*) FROM Crm WHERE status = 'reviewing'"),
        "interested": count("SELECT COUNT(*) FROM Crm WHERE status = 'interested'"),
        "contacted": count("SELECT COUNT(*) FROM Crm WHERE status = 'contacted'"),
        "passed": count("SELECT COUNT(*) FROM Crm WHERE status = 'passed'"),
        "hired": count("SELECT COUNT(*) FROM Crm WHERE status = 'hired'"),
    }
