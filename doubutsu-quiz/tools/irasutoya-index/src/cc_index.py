"""Common Crawl CDX index access via direct S3 reads of cluster.idx + cdx shards.

The public CDX HTTP API (index.commoncrawl.org) is frequently overloaded and
returns 504. We bypass it by reading the cluster.idx file directly from the
public S3 bucket, locating the SURT-sorted blocks that contain a given domain,
and range-fetching only those blocks from the corresponding cdx-NNNNN.gz shard.

Each block in a cdx-NNNNN.gz shard is an independently-gzipped member, so we
decode them with zlib in sequence.
"""

from __future__ import annotations

import json
import logging
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import requests

from src.rate_limit import rate_limited_get

DATA_BASE = "https://data.commoncrawl.org"
USER_AGENT = "kuma-lab/irasutoya-index (https://github.com/kuma-private/kuma-lab)"

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class CdxEntry:
    surt: str
    timestamp: str
    url: str
    mime: str
    status: str
    digest: str
    filename: str
    offset: int
    length: int
    languages: str | None


@dataclass(frozen=True)
class ClusterBlock:
    shard: str
    offset: int
    length: int
    first_surt: str


def list_collections() -> list[dict]:
    sess = requests.Session()
    r = rate_limited_get(
        sess,
        "https://index.commoncrawl.org/collinfo.json",
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    return r.json()


def cluster_idx_url(collection: str) -> str:
    return f"{DATA_BASE}/cc-index/collections/{collection}/indexes/cluster.idx"


def shard_url(collection: str, shard: str) -> str:
    return f"{DATA_BASE}/cc-index/collections/{collection}/indexes/{shard}"


def download_cluster_idx(collection: str, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{collection}.cluster.idx"
    if path.exists() and path.stat().st_size > 0:
        log.info("cluster.idx cached: %s (%d bytes)", path, path.stat().st_size)
        return path
    url = cluster_idx_url(collection)
    log.info("downloading cluster.idx: %s", url)
    tmp = path.with_suffix(path.suffix + ".tmp")
    sess = requests.Session()
    r = rate_limited_get(
        sess,
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=600,
    )
    with open(tmp, "wb") as f:
        f.write(r.content)
    tmp.rename(path)
    log.info("cluster.idx saved: %s (%d bytes)", path, path.stat().st_size)
    return path


def find_blocks_for_surt_prefix(
    cluster_idx_path: Path, surt_prefix: str
) -> list[ClusterBlock]:
    """Return the set of cdx shard blocks that may contain rows whose SURT
    starts with surt_prefix.

    cluster.idx rows look like:
        com,irasutoya)/2015/05/blog-post_235.html 20241202110354\tcdx-00084.gz\t407353507\t174232\t293284

    A block begins at a given SURT and extends until the SURT of the next row.
    So a block overlaps the target prefix iff:
        block.first_surt <= (max value with prefix)  AND
        next_block.first_surt > (min value with prefix)
    Equivalently: keep the block starting with the prefix, plus the immediately
    preceding block (its tail may spill into the prefix range), until the first
    block that no longer starts with the prefix.
    """
    blocks: list[ClusterBlock] = []
    prev_line_parts: list[str] | None = None
    pending_prev = False  # include the line just before the first match

    with open(cluster_idx_path, "rb") as f:
        for raw in f:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            if not line:
                continue
            # first field is "<surt> <timestamp>" separated by a space
            # the rest are tab-separated: shard, offset, length, row_id
            space_idx = line.find(" ")
            if space_idx < 0:
                continue
            first_surt = line[:space_idx]
            tail = line[space_idx + 1:]
            parts = tail.split("\t")
            if len(parts) < 4:
                continue
            shard = parts[1]
            offset = int(parts[2])
            length = int(parts[3])
            block = ClusterBlock(shard=shard, offset=offset, length=length,
                                 first_surt=first_surt)

            if first_surt.startswith(surt_prefix):
                if pending_prev is False and prev_line_parts is not None:
                    blocks.append(prev_line_parts)  # type: ignore[arg-type]
                blocks.append(block)
                pending_prev = True
            else:
                if pending_prev:
                    # first block past the prefix — we still need to include
                    # it since rows strictly less than its first_surt (and
                    # greater than the last seen prefix row) may be in the
                    # previous block. But here we've already included the
                    # previous block. So stop.
                    break
                prev_line_parts = block  # type: ignore[assignment]

    return blocks


def fetch_shard_block(
    collection: str,
    block: ClusterBlock,
    session: requests.Session | None = None,
) -> bytes:
    url = shard_url(collection, block.shard)
    start = block.offset
    end = block.offset + block.length - 1
    sess = session or requests.Session()
    r = rate_limited_get(
        sess,
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Range": f"bytes={start}-{end}",
        },
        timeout=120,
    )
    return r.content


def decode_multimember_gzip(data: bytes) -> bytes:
    out = bytearray()
    pos = 0
    while pos < len(data):
        if data[pos:pos + 2] != b"\x1f\x8b":
            break
        d = zlib.decompressobj(31)
        chunk = d.decompress(data[pos:])
        if d.unused_data:
            consumed = len(data) - pos - len(d.unused_data)
        else:
            consumed = len(data) - pos
        out += chunk
        pos += consumed
    return bytes(out)


def iter_cdx_lines_for_domain(
    collection: str,
    surt_prefix: str,
    cache_dir: Path,
) -> Iterator[CdxEntry]:
    idx_path = download_cluster_idx(collection, cache_dir)
    blocks = find_blocks_for_surt_prefix(idx_path, surt_prefix)
    log.info("matched %d shard block(s) for prefix %s", len(blocks), surt_prefix)
    session = requests.Session()
    for block in blocks:
        log.info("fetching block: %s offset=%d length=%d",
                 block.shard, block.offset, block.length)
        raw = fetch_shard_block(collection, block, session=session)
        decoded = decode_multimember_gzip(raw)
        for line in decoded.split(b"\n"):
            if not line:
                continue
            if not line.startswith(surt_prefix.encode("utf-8")):
                continue
            try:
                parsed = _parse_cdx_line(line)
            except Exception as exc:
                log.debug("skipping unparseable cdx line: %s", exc)
                continue
            yield parsed


def _parse_cdx_line(line: bytes) -> CdxEntry:
    text = line.decode("utf-8", errors="replace")
    # "<surt> <timestamp> <json>"
    first_space = text.find(" ")
    second_space = text.find(" ", first_space + 1)
    surt = text[:first_space]
    timestamp = text[first_space + 1:second_space]
    payload = text[second_space + 1:]
    obj = json.loads(payload)
    return CdxEntry(
        surt=surt,
        timestamp=timestamp,
        url=obj["url"],
        mime=obj.get("mime", ""),
        status=obj.get("status", ""),
        digest=obj.get("digest", ""),
        filename=obj["filename"],
        offset=int(obj["offset"]),
        length=int(obj["length"]),
        languages=obj.get("languages"),
    )
