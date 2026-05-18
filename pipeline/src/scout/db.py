import psycopg
import psycopg.rows
import json
import time
from datetime import datetime, timezone
from typing import Any

from scout.config import get_database_url


def connect() -> psycopg.Connection:
    return psycopg.connect(
        get_database_url(),
        autocommit=False,
        row_factory=psycopg.rows.dict_row,
    )


# --- Candidate ---

def upsert_candidate(conn: psycopg.Connection, c: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "Candidate"
           (login, name, bio, location, company, blog, twitter,
            hireable, followers, "publicRepos", "avatarUrl", "htmlUrl",
            "githubCreatedAt", "fetchedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT(login) DO UPDATE SET
             name=EXCLUDED.name, bio=EXCLUDED.bio, location=EXCLUDED.location,
             company=EXCLUDED.company, blog=EXCLUDED.blog, twitter=EXCLUDED.twitter,
             hireable=EXCLUDED.hireable, followers=EXCLUDED.followers,
             "publicRepos"=EXCLUDED."publicRepos", "avatarUrl"=EXCLUDED."avatarUrl",
             "htmlUrl"=EXCLUDED."htmlUrl", "githubCreatedAt"=EXCLUDED."githubCreatedAt",
             "fetchedAt"=EXCLUDED."fetchedAt"
        """,
        (
            c["login"], c.get("name"), c.get("bio"), c.get("location"),
            c.get("company"), c.get("blog"), c.get("twitter"),
            c.get("hireable"), c.get("followers", 0), c.get("public_repos", 0),
            c.get("avatar_url"), c.get("html_url"),
            c.get("created_at"), datetime.now(timezone.utc).isoformat(),
        ),
    )


# --- ForkMeta ---

def upsert_fork_meta(conn: psycopg.Connection, login: str, f: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "ForkMeta"
           ("candidateLogin", "forkHtmlUrl", "forkPushedAt", "forkStars",
            "aheadBy", "behindBy", "hasOwnCommits", "defaultBranch")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             "forkHtmlUrl"=EXCLUDED."forkHtmlUrl", "forkPushedAt"=EXCLUDED."forkPushedAt",
             "forkStars"=EXCLUDED."forkStars", "aheadBy"=EXCLUDED."aheadBy",
             "behindBy"=EXCLUDED."behindBy", "hasOwnCommits"=EXCLUDED."hasOwnCommits",
             "defaultBranch"=EXCLUDED."defaultBranch"
        """,
        (
            login, f.get("html_url"), f.get("pushed_at"), f.get("stargazers_count", 0),
            f.get("ahead_by", 0), f.get("behind_by", 0),
            f.get("has_own_commits", False), f.get("default_branch"),
        ),
    )


# --- Repo ---

def insert_repos(conn: psycopg.Connection, login: str, repos: list[dict]) -> None:
    conn.execute("""DELETE FROM "Repo" WHERE "candidateLogin" = %s""", (login,))
    for r in repos:
        conn.execute(
            """INSERT INTO "Repo"
               ("candidateLogin", name, "htmlUrl", description, language, stars, forks, "pushedAt", "isFork")
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (login, r["name"], r["html_url"], r.get("description"),
             r.get("language"), r.get("stargazers_count", 0),
             r.get("forks_count", 0), r.get("pushed_at"), r.get("fork", False)),
        )


# --- Event ---

def insert_events(conn: psycopg.Connection, login: str, events: list[dict]) -> None:
    conn.execute("""DELETE FROM "Event" WHERE "candidateLogin" = %s""", (login,))
    for e in events:
        conn.execute(
            """INSERT INTO "Event" ("candidateLogin", type, "repoName", "createdAt", payload)
               VALUES (%s, %s, %s, %s, %s)""",
            (login, e["type"], e.get("repo", {}).get("name"),
             e["created_at"], json.dumps(e.get("payload", {}))[:2000]),
        )


# --- Profile ---

def upsert_profile(conn: psycopg.Connection, login: str, p: dict[str, Any], prompt_version: int = 1) -> None:
    conn.execute(
        """INSERT INTO "Profile"
           ("candidateLogin", summary, seniority, "fitScore", "fitReasoning",
            "recommendedOutreach", "outreachReason", confidence, model,
            "promptVersion", "generatedAt", "rawJson")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             summary=EXCLUDED.summary, seniority=EXCLUDED.seniority,
             "fitScore"=EXCLUDED."fitScore", "fitReasoning"=EXCLUDED."fitReasoning",
             "recommendedOutreach"=EXCLUDED."recommendedOutreach",
             "outreachReason"=EXCLUDED."outreachReason",
             confidence=EXCLUDED.confidence, model=EXCLUDED.model,
             "promptVersion"=EXCLUDED."promptVersion",
             "generatedAt"=EXCLUDED."generatedAt", "rawJson"=EXCLUDED."rawJson"
        """,
        (login, p.get("summary"), p.get("seniority"), p.get("fit_score"),
         p.get("fit_reasoning"), p.get("recommended_outreach"),
         p.get("outreach_reason"), p.get("confidence"),
         p.get("model"), prompt_version,
         datetime.now(timezone.utc).isoformat(), json.dumps(p)),
    )


# --- Signal / Skill ---

def insert_signals(conn: psycopg.Connection, login: str, signals: list[dict]) -> None:
    conn.execute("""DELETE FROM "Signal" WHERE "candidateLogin" = %s""", (login,))
    for s in signals:
        conn.execute(
            """INSERT INTO "Signal" ("candidateLogin", kind, text) VALUES (%s, %s, %s)""",
            (login, s["kind"], s["text"]),
        )


def insert_skills(conn: psycopg.Connection, login: str, skills: list[str]) -> None:
    conn.execute("""DELETE FROM "Skill" WHERE "candidateLogin" = %s""", (login,))
    for name in skills:
        conn.execute(
            """INSERT INTO "Skill" ("candidateLogin", name) VALUES (%s, %s)""",
            (login, name),
        )


# --- Crm ---

def ensure_crm(conn: psycopg.Connection, login: str) -> None:
    conn.execute(
        """INSERT INTO "Crm" ("candidateLogin", status, "updatedAt")
           VALUES (%s, 'new', %s) ON CONFLICT("candidateLogin") DO NOTHING""",
        (login, datetime.now(timezone.utc).isoformat()),
    )


# --- LinkedInProfile ---

def upsert_linkedin_profile(conn: psycopg.Connection, login: str, data: dict[str, Any]) -> None:
    conn.execute(
        """INSERT INTO "LinkedInProfile"
           ("candidateLogin", "profileUrl", headline, "currentTitle", "currentCompany",
            location, "connectionCount", experience, education, skills, certifications, "scrapedAt")
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT("candidateLogin") DO UPDATE SET
             "profileUrl"=EXCLUDED."profileUrl", headline=EXCLUDED.headline,
             "currentTitle"=EXCLUDED."currentTitle", "currentCompany"=EXCLUDED."currentCompany",
             location=EXCLUDED.location, "connectionCount"=EXCLUDED."connectionCount",
             experience=EXCLUDED.experience, education=EXCLUDED.education,
             skills=EXCLUDED.skills, certifications=EXCLUDED.certifications,
             "scrapedAt"=EXCLUDED."scrapedAt"
        """,
        (login, data.get("profile_url"), data.get("headline"),
         data.get("current_title"), data.get("current_company"),
         data.get("location"), data.get("connection_count"),
         json.dumps(data.get("experience", [])),
         json.dumps(data.get("education", [])),
         json.dumps(data.get("skills", [])),
         json.dumps(data.get("certifications", [])),
         datetime.now(timezone.utc).isoformat()),
    )


# --- WebMention ---

def insert_web_mentions(conn: psycopg.Connection, login: str, mentions: list[dict]) -> None:
    conn.execute("""DELETE FROM "WebMention" WHERE "candidateLogin" = %s""", (login,))
    for m in mentions:
        conn.execute(
            """INSERT INTO "WebMention" ("candidateLogin", url, title, snippet, source, content, "scrapedAt")
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (login, m["url"], m.get("title"), m.get("snippet"),
             m.get("source", "google"), (m.get("content") or "")[:5000],
             datetime.now(timezone.utc).isoformat()),
        )


# --- EnrichmentLog ---

def insert_enrichment_log(
    conn: psycopg.Connection, login: str, tool: str,
    input_data: dict, output_data: Any, duration_ms: int | None = None,
    error: str | None = None,
) -> None:
    output_str = json.dumps(output_data, default=str)[:10000] if output_data else "{}"
    conn.execute(
        """INSERT INTO "EnrichmentLog" ("candidateLogin", tool, input, output, "durationMs", error, "createdAt")
           VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s, %s)""",
        (login, tool, json.dumps(input_data), output_str, duration_ms, error,
         datetime.now(timezone.utc).isoformat()),
    )


# --- Queries ---

def get_unenriched_logins(conn: psycopg.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM "Candidate"
             WHERE login NOT IN (SELECT DISTINCT "candidateLogin" FROM "EnrichmentLog")
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_unanalyzed_logins(conn: psycopg.Connection, limit: int | None = None) -> list[str]:
    sql = """SELECT login FROM "Candidate"
             WHERE login NOT IN (SELECT "candidateLogin" FROM "Profile")
             AND login IN (SELECT DISTINCT "candidateLogin" FROM "Repo")
             ORDER BY login"""
    if limit:
        sql += f" LIMIT {limit}"
    return [r["login"] for r in conn.execute(sql).fetchall()]


def get_candidate_bundle(conn: psycopg.Connection, login: str) -> dict[str, Any] | None:
    row = conn.execute("""SELECT * FROM "Candidate" WHERE login = %s""", (login,)).fetchone()
    if not row:
        return None
    c = dict(row)
    c["repos"] = [dict(r) for r in conn.execute(
        """SELECT * FROM "Repo" WHERE "candidateLogin" = %s ORDER BY stars DESC LIMIT 10""", (login,)).fetchall()]
    c["events"] = [dict(e) for e in conn.execute(
        """SELECT * FROM "Event" WHERE "candidateLogin" = %s ORDER BY "createdAt" DESC LIMIT 30""", (login,)).fetchall()]
    fork = conn.execute("""SELECT * FROM "ForkMeta" WHERE "candidateLogin" = %s""", (login,)).fetchone()
    c["fork_meta"] = dict(fork) if fork else None
    li = conn.execute("""SELECT * FROM "LinkedInProfile" WHERE "candidateLogin" = %s""", (login,)).fetchone()
    c["linkedin"] = dict(li) if li else None
    c["web_mentions"] = [dict(w) for w in conn.execute(
        """SELECT * FROM "WebMention" WHERE "candidateLogin" = %s ORDER BY "scrapedAt" DESC""", (login,)).fetchall()]
    return c


def get_enrichment_status(conn: psycopg.Connection, login: str) -> dict[str, Any]:
    logs = [dict(r) for r in conn.execute(
        """SELECT tool, error, "durationMs", "createdAt"
           FROM "EnrichmentLog" WHERE "candidateLogin" = %s
           ORDER BY "createdAt" DESC LIMIT 50""", (login,)).fetchall()]
    has_repos = conn.execute(
        """SELECT COUNT(*) as c FROM "Repo" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    has_profile = conn.execute(
        """SELECT COUNT(*) as c FROM "Profile" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    has_linkedin = conn.execute(
        """SELECT COUNT(*) as c FROM "LinkedInProfile" WHERE "candidateLogin" = %s""", (login,)).fetchone()["c"] > 0
    return {
        "login": login,
        "enriched": has_repos,
        "analyzed": has_profile,
        "hasLinkedIn": has_linkedin,
        "toolCalls": len(logs),
        "recentLogs": logs[:10],
    }


def get_stats(conn: psycopg.Connection) -> dict[str, int]:
    def count(sql: str) -> int:
        return conn.execute(sql).fetchone()["count"]
    return {
        "candidates": count("""SELECT COUNT(*) as count FROM "Candidate" """),
        "enriched": count("""SELECT COUNT(DISTINCT "candidateLogin") as count FROM "Repo" """),
        "analyzed": count("""SELECT COUNT(*) as count FROM "Profile" """),
        "tool_calls": count("""SELECT COUNT(*) as count FROM "EnrichmentLog" """),
        "new": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'new'"""),
        "reviewing": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'reviewing'"""),
        "interested": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'interested'"""),
        "contacted": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'contacted'"""),
        "passed": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'passed'"""),
        "hired": count("""SELECT COUNT(*) as count FROM "Crm" WHERE status = 'hired'"""),
    }
