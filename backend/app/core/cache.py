"""Thread-safe in-memory TTL cache used by the data provider."""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import TypeVar

from cachetools import TTLCache

T = TypeVar("T")


class TTLStore:
    """A namespaced collection of TTL caches. Each namespace has its own time-to-live."""

    def __init__(self, max_entries: int) -> None:
        self._max_entries = max_entries
        self._caches: dict[str, TTLCache] = {}
        self._lock = threading.RLock()

    def _cache(self, namespace: str, ttl: int) -> TTLCache:
        with self._lock:
            if namespace not in self._caches:
                self._caches[namespace] = TTLCache(maxsize=self._max_entries, ttl=ttl)
            return self._caches[namespace]

    def get_or_set(self, namespace: str, key: str, ttl: int, factory: Callable[[], T]) -> T:
        """Return the cached value for ``key`` or compute it with ``factory`` and store it.

        Exceptions raised by ``factory`` propagate and nothing is cached, so failures are retried
        on the next request rather than being pinned for the whole TTL.
        """
        cache = self._cache(namespace, ttl)
        with self._lock:
            if key in cache:
                return cache[key]
        value = factory()
        with self._lock:
            cache[key] = value
        return value

    def clear(self) -> None:
        with self._lock:
            for cache in self._caches.values():
                cache.clear()
