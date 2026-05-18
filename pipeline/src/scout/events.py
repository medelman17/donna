import json
import redis
from scout.config import get_redis_url

_pub_client: redis.Redis | None = None


def _get_pub() -> redis.Redis:
    global _pub_client
    if _pub_client is None:
        _pub_client = redis.Redis.from_url(get_redis_url(), decode_responses=True)
    return _pub_client


def publish(login: str, event_type: str, data: dict | None = None) -> None:
    event = {"type": event_type, **(data or {})}
    try:
        _get_pub().publish(f"scout:enrich:{login}", json.dumps(event, default=str))
    except Exception:
        pass
