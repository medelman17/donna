import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
CACHE_DIR = PROJECT_ROOT / "pipeline" / ".cache"
FORK_REPO = "willchen96/mike"
MODEL = "claude-opus-4-7"


def get_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return key


def get_database_url() -> str:
    return os.environ.get("DATABASE_URL", "postgresql://scout:scout_dev@localhost:54320/scout")


def get_redis_url() -> str:
    return os.environ.get("REDIS_URL", "redis://localhost:63790")


def get_browserbase_keys() -> tuple[str, str]:
    api_key = os.environ.get("BROWSERBASE_API_KEY", "")
    project_id = os.environ.get("BROWSERBASE_PROJECT_ID", "")
    if not api_key or not project_id:
        raise RuntimeError("BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set")
    return api_key, project_id


def get_firecrawl_key() -> str:
    key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not key:
        raise RuntimeError("FIRECRAWL_API_KEY not set")
    return key
