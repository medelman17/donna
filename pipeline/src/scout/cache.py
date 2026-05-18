import json
import hashlib
from typing import Any

import redis
from rich.console import Console

from scout.config import get_redis_url

console = Console()
_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(get_redis_url(), decode_responses=True)
    return _client


def cache_get(namespace: str, key: str) -> Any | None:
    r = get_redis()
    cache_key = f"scout:{namespace}:{_hash(key)}"
    val = r.get(cache_key)
    if val:
        console.print(f"      [dim]cache hit: {namespace}/{key[:60]}[/dim]")
        return json.loads(val)
    return None


def cache_set(namespace: str, key: str, value: Any, ttl: int = 86400) -> None:
    r = get_redis()
    cache_key = f"scout:{namespace}:{_hash(key)}"
    r.setex(cache_key, ttl, json.dumps(value, default=str))


def cache_stats() -> dict[str, int]:
    r = get_redis()
    keys = list(r.scan_iter("scout:*", count=1000))
    by_ns: dict[str, int] = {}
    for k in keys:
        parts = k.split(":")
        ns = parts[1] if len(parts) >= 3 else "unknown"
        by_ns[ns] = by_ns.get(ns, 0) + 1
    return by_ns


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]
