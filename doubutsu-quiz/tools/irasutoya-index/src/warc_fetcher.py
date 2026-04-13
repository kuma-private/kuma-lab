"""Range-fetch individual WARC records from Common Crawl's public S3 mirror."""

from __future__ import annotations

import io
import logging

import requests
from warcio.archiveiterator import ArchiveIterator

from src.rate_limit import rate_limited_get

DATA_BASE = "https://data.commoncrawl.org"
USER_AGENT = "kuma-lab/irasutoya-index (https://github.com/kuma-private/kuma-lab)"

log = logging.getLogger(__name__)


def fetch_warc_record(filename: str, offset: int, length: int,
                       session: requests.Session | None = None,
                       timeout: int = 90) -> tuple[bytes, dict]:
    """Fetch a single WARC record and return (payload_bytes, headers_dict).

    headers_dict contains the HTTP response headers from the captured page.
    """
    url = f"{DATA_BASE}/{filename}"
    sess = session or requests.Session()
    r = rate_limited_get(
        sess,
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Range": f"bytes={offset}-{offset + length - 1}",
        },
        timeout=timeout,
    )
    stream = io.BytesIO(r.content)
    for record in ArchiveIterator(stream):
        if record.rec_type != "response":
            continue
        payload = record.content_stream().read()
        http_headers = {}
        if record.http_headers is not None:
            for k, v in record.http_headers.headers:
                http_headers[k.lower()] = v
        return payload, http_headers
    raise RuntimeError(f"no response record in warc slice: {url}")
