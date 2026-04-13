"""Process-wide rate limiting and retry helpers for data.commoncrawl.org.

data.commoncrawl.org is fronted by CloudFront with a WAF that blocks clients
exceeding roughly a dozen requests per second. Exceeding the threshold causes
the source IP to be banned for several minutes (403 "Request blocked").

We therefore:
  1. Gate every outbound request through a single process-wide token bucket
     sized for a conservative sustained QPS.
  2. Retry 403/429/5xx responses with exponential backoff, on the chance that
     the block is transient or that we tripped the limiter mid-flight.

Both the CDX shard range fetches and the WARC range fetches share the same
limiter so that total offered load never exceeds the budget, regardless of
thread count.
"""

from __future__ import annotations

import logging
import random
import threading
import time

import requests

log = logging.getLogger(__name__)

# Common Crawl's public guidance is to stay under roughly 5 requests per
# second per IP. We leave a little headroom.
DEFAULT_QPS = 4.0
DEFAULT_BURST = 4
DEFAULT_MAX_RETRIES = 6
DEFAULT_BACKOFF_BASE = 2.0  # seconds


class TokenBucket:
    """Simple thread-safe token bucket limiter.

    Tokens refill continuously at `rate` tokens/sec up to `capacity`.
    `acquire()` blocks until one token is available and consumes it.
    """

    def __init__(self, rate: float, capacity: int) -> None:
        self.rate = rate
        self.capacity = capacity
        self._tokens = float(capacity)
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        while True:
            with self._lock:
                now = time.monotonic()
                elapsed = now - self._last
                self._last = now
                self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                needed = 1.0 - self._tokens
                wait = needed / self.rate
            time.sleep(wait)


_limiter = TokenBucket(DEFAULT_QPS, DEFAULT_BURST)


def set_qps(qps: float, burst: int | None = None) -> None:
    """Reconfigure the shared limiter. Call from main() if desired."""
    global _limiter
    _limiter = TokenBucket(qps, burst or max(1, int(qps)))


def rate_limited_get(
    session: requests.Session,
    url: str,
    headers: dict[str, str],
    timeout: int,
    max_retries: int = DEFAULT_MAX_RETRIES,
    backoff_base: float = DEFAULT_BACKOFF_BASE,
) -> requests.Response:
    """GET `url` through the shared rate limiter with retry on 403/429/5xx.

    Raises RuntimeError if every attempt fails.
    """
    attempt = 0
    while True:
        _limiter.acquire()
        try:
            r = session.get(url, headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            if attempt >= max_retries:
                raise RuntimeError(f"network error for {url}: {exc}") from exc
            delay = backoff_base * (2 ** attempt) + random.uniform(0, 1)
            log.warning("network error (attempt %d): %s — sleeping %.1fs",
                        attempt + 1, exc, delay)
            time.sleep(delay)
            attempt += 1
            continue

        if r.status_code in (200, 206):
            return r

        # Transient / throttling responses get retried.
        if r.status_code in (403, 429, 500, 502, 503, 504):
            if attempt >= max_retries:
                raise RuntimeError(
                    f"fetch {url} failed after {max_retries + 1} attempts: "
                    f"HTTP {r.status_code}"
                )
            delay = backoff_base * (2 ** attempt) + random.uniform(0, 1)
            log.warning(
                "HTTP %d for %s (attempt %d) — backing off %.1fs",
                r.status_code, url, attempt + 1, delay,
            )
            time.sleep(delay)
            attempt += 1
            continue

        # Non-retriable.
        raise RuntimeError(f"fetch {url} failed: HTTP {r.status_code}")
