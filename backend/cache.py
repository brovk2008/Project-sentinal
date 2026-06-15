import time
from typing import Any, Optional

_cache = {}
_ttl = {}
DEFAULT_TTL = 300  # 5 minutes

def get(key: str) -> Optional[Any]:
    """Retrieves an item from the cache. Returns None if not found or expired."""
    if key in _cache:
        expire_time = _ttl.get(key, 0)
        if time.time() < expire_time:
            return _cache[key]
        else:
            # Expired
            invalidate(key)
    return None

def set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    """Sets a value in the cache with a specific TTL (in seconds)."""
    _cache[key] = value
    _ttl[key] = time.time() + ttl

def invalidate(key: str) -> None:
    """Removes an item from the cache."""
    _cache.pop(key, None)
    _ttl.pop(key, None)

def clear() -> None:
    """Clears the entire cache."""
    _cache.clear()
    _ttl.clear()
