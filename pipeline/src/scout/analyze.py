import json
import sqlite3
import anthropic

from scout.config import MODEL, get_api_key
from scout.prompts import SYSTEM_PROMPT, TOOL_SCHEMA, build_user_message
from scout import db


MAX_CONTINUATIONS = 5


def analyze_candidate(conn: sqlite3.Connection, bundle: dict) -> dict | None:
    login = bundle["login"]
    client = anthropic.Anthropic(api_key=get_api_key())
    user_message = build_user_message(bundle)

    messages: list[dict] = [{"role": "user", "content": user_message}]

    for _ in range(MAX_CONTINUATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=[{
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=[
                {**TOOL_SCHEMA, "cache_control": {"type": "ephemeral"}},
                {"type": "web_search_20260209", "name": "web_search"},
                {"type": "web_fetch_20260209", "name": "web_fetch"},
            ],
            tool_choice={"type": "auto"},
            messages=messages,
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "record_profile":
                profile_data = block.input
                profile_data["model"] = MODEL
                _persist(conn, login, profile_data)

                usage = response.usage
                return {
                    "login": login,
                    "fit_score": profile_data.get("fit_score"),
                    "input_tokens": usage.input_tokens,
                    "output_tokens": usage.output_tokens,
                    "cache_read": getattr(usage, "cache_read_input_tokens", 0),
                    "cache_create": getattr(usage, "cache_creation_input_tokens", 0),
                }

        if response.stop_reason == "pause_turn":
            messages = [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": response.content},
            ]
            continue

        if response.stop_reason == "end_turn":
            break

        break

    return None


def _persist(conn: sqlite3.Connection, login: str, data: dict) -> None:
    db.upsert_profile(conn, login, data)
    db.insert_signals(conn, login, data.get("signals", []))
    db.insert_skills(conn, login, data.get("skills", []))
    db.ensure_crm(conn, login)
    conn.commit()
