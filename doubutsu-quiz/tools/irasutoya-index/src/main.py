"""Build an irasutoya.com metadata index from Common Crawl archives."""

from __future__ import annotations

# IMPORTANT: install the IPv4-only socket patch before any network library
# import. data.commoncrawl.org returns IPv6-only DNS answers on this network
# and Python's socket stack has no happy-eyeballs fallback, so connects hang
# until OS timeout. See src/_ipv4_patch.py.
import src._ipv4_patch  # noqa: F401  # side-effect import

import argparse
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from tqdm import tqdm

from src.cc_index import CdxEntry, iter_cdx_lines_for_domain
from src.html_parser import ParsedArticle, is_article_url, parse_article
from src.rate_limit import set_qps
from src.warc_fetcher import fetch_warc_record

log = logging.getLogger("irasutoya-index")

TOOL_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = TOOL_ROOT / "cache"
OUTPUT_DIR = TOOL_ROOT / "output"

IRASUTOYA_SURT_PREFIX = "com,irasutoya)"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--collection",
        action="append",
        required=True,
        help="CC collection id, e.g. CC-MAIN-2024-51. Repeatable.",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N unique article URLs (sample run).",
    )
    p.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel WARC fetchers (default 8).",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON path (default output/irasutoya_index.json).",
    )
    p.add_argument(
        "--qps",
        type=float,
        default=4.0,
        help="Process-wide request rate cap against data.commoncrawl.org "
             "(default 4.0). Stay under ~5 to avoid CloudFront WAF blocks.",
    )
    p.add_argument(
        "--log-level",
        default="INFO",
    )
    return p.parse_args()


def setup_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper()),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def collect_cdx_entries(collections: list[str]) -> list[CdxEntry]:
    """Query each CC collection for irasutoya.com CDX rows.

    Deduplicates by URL; when a URL appears in multiple crawls, the most
    recent timestamp wins.
    """
    by_url: dict[str, CdxEntry] = {}
    for collection in collections:
        log.info("querying CDX for collection %s", collection)
        count = 0
        for entry in iter_cdx_lines_for_domain(
            collection, IRASUTOYA_SURT_PREFIX, CACHE_DIR
        ):
            count += 1
            if entry.status != "200":
                continue
            if "html" not in (entry.mime or "") and entry.mime != "":
                continue
            existing = by_url.get(entry.url)
            if existing is None or entry.timestamp > existing.timestamp:
                by_url[entry.url] = entry
        log.info("collection %s: %d raw CDX rows scanned", collection, count)
    log.info("unique URLs after dedupe: %d", len(by_url))
    return list(by_url.values())


def filter_article_entries(entries: list[CdxEntry]) -> list[CdxEntry]:
    article_entries = [e for e in entries if is_article_url(e.url)]
    log.info("article URLs: %d / %d", len(article_entries), len(entries))
    return article_entries


def process_entry(
    entry: CdxEntry, session: requests.Session
) -> ParsedArticle | None:
    payload, _http = fetch_warc_record(
        entry.filename, entry.offset, entry.length, session=session
    )
    return parse_article(payload, entry.url)


def build_index(
    entries: list[CdxEntry], workers: int
) -> tuple[list[ParsedArticle], int]:
    parsed: list[ParsedArticle] = []
    failures = 0
    session = requests.Session()
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(process_entry, e, session): e for e in entries}
        for fut in tqdm(as_completed(futures), total=len(futures), unit="page"):
            entry = futures[fut]
            try:
                result = fut.result()
            except Exception as exc:
                failures += 1
                log.warning("failed %s: %s", entry.url, exc)
                continue
            if result is None:
                failures += 1
                log.debug("no parse result for %s", entry.url)
                continue
            parsed.append(result)
    return parsed, failures


def write_output(
    parsed: list[ParsedArticle],
    collections: list[str],
    output_path: Path,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "version": "+".join(collections),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total_entries": len(parsed),
        "entries": [asdict(p) for p in parsed],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    log.info("wrote %s (%d entries)", output_path, len(parsed))


def main() -> int:
    args = parse_args()
    setup_logging(args.log_level)
    set_qps(args.qps)
    log.info("rate limit: %.1f req/s (workers=%d)", args.qps, args.workers)

    cdx_entries = collect_cdx_entries(args.collection)
    article_entries = filter_article_entries(cdx_entries)

    if args.limit is not None:
        article_entries = sorted(article_entries, key=lambda e: e.url)[: args.limit]
        log.info("sampling first %d entries", len(article_entries))

    parsed, failures = build_index(article_entries, args.workers)
    log.info("parsed %d / %d (failures: %d)",
             len(parsed), len(article_entries), failures)

    output_path = args.output or (OUTPUT_DIR / "irasutoya_index.json")
    write_output(parsed, args.collection, output_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
