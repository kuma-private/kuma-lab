"""Parse an irasutoya.com article page and extract structured metadata.

Irasutoya uses a customised Blogger template. Each article page contains:
  - <title>「…」のイラスト | かわいいフリー素材集 いらすとや</title>
  - <meta property="og:title" content="「…」のイラスト">
  - <div class="entry"> with the article body: one or more <div class="separator">
    blocks, each wrapping <a href="…full image…"><img src="…thumbnail…"/></a>,
    followed by a descriptive paragraph.
  - Immediately after the entry div, a sibling post-footer:
      <div class="titlemeta clearfix">
        <span class="category"> カテゴリー:
          <a href="…/search/label/…" rel="tag">お年賀状</a>,
          <a href="…/search/label/…" rel="tag">干支</a>, …
        </span>
      </div>
    This is where the per-article categories live, NOT inside div.entry.

The article URL path /YYYY/MM/blog-post_NNN.html encodes the publish year/month.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from urllib.parse import urlparse

from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

SITE_TITLE_SUFFIX = " | かわいいフリー素材集 いらすとや"


@dataclass
class ParsedArticle:
    id: str
    page_url: str
    title: str
    description: str
    image_urls: list[str]
    categories: list[str]
    published_at: str | None


def make_id(url: str) -> str:
    path = urlparse(url).path
    slug = re.sub(r"[^0-9A-Za-z]+", "_", path.strip("/")).strip("_")
    if slug:
        return f"irasutoya_{slug}"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
    return f"irasutoya_{digest}"


def _derive_published_at(url: str) -> str | None:
    m = re.search(r"/(\d{4})/(\d{2})/", urlparse(url).path)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return None


def _clean_title(title: str) -> str:
    if title.endswith(SITE_TITLE_SUFFIX):
        return title[: -len(SITE_TITLE_SUFFIX)]
    return title


def _upgrade_blogger_image(src: str) -> str:
    """Rewrite a blogger thumbnail URL to the largest available resolution.

    Example input:
      https://blogger.googleusercontent.com/img/b/R29v…/AVvX…/s400/name.png
      https://blogger.googleusercontent.com/img/b/R29v…/AVvX…/s1600-h/name.png
    Output:
      …/s1600/name.png
    """
    return re.sub(r"/s\d+(?:-[a-z])?/", "/s1600/", src)


def parse_article(html: bytes | str, page_url: str) -> ParsedArticle | None:
    if isinstance(html, bytes):
        soup = BeautifulSoup(html, "lxml")
    else:
        soup = BeautifulSoup(html, "lxml")

    og_title = soup.find("meta", attrs={"property": "og:title"})
    title = og_title.get("content", "").strip() if og_title else ""
    if not title:
        title_tag = soup.find("title")
        if title_tag:
            title = _clean_title(title_tag.get_text(strip=True))
    if not title:
        return None

    entry = soup.find("div", class_="entry")
    if entry is None:
        return None

    description_parts: list[str] = []
    for p in entry.find_all(["p", "div"], recursive=False):
        txt = p.get_text(" ", strip=True)
        if txt and "class" in p.attrs and "separator" in p.get("class", []):
            continue
        if txt:
            description_parts.append(txt)
    if not description_parts:
        description_parts.append(entry.get_text(" ", strip=True))
    description = "\n".join(description_parts).strip()

    image_urls: list[str] = []
    seen = set()
    for a in entry.find_all("a"):
        href = a.get("href", "")
        if "blogger.googleusercontent.com" in href or "irasutoya" in href:
            full = _upgrade_blogger_image(href)
            if full not in seen:
                image_urls.append(full)
                seen.add(full)
    if not image_urls:
        for img in entry.find_all("img"):
            src = img.get("src", "")
            if src:
                full = _upgrade_blogger_image(src)
                if full not in seen:
                    image_urls.append(full)
                    seen.add(full)

    categories: list[str] = []
    category_span = soup.select_one("div.titlemeta span.category")
    if category_span is not None:
        for a in category_span.find_all("a", rel="tag"):
            label = a.get_text(strip=True)
            if label and label not in categories:
                categories.append(label)

    published_at = _derive_published_at(page_url)

    return ParsedArticle(
        id=make_id(page_url),
        page_url=page_url,
        title=title,
        description=description,
        image_urls=image_urls,
        categories=categories,
        published_at=published_at,
    )


def is_article_url(url: str) -> bool:
    """Article pages have path /YYYY/MM/something.html. Skip search/label/etc."""
    p = urlparse(url).path
    if not p.endswith(".html"):
        return False
    return bool(re.match(r"^/\d{4}/\d{2}/", p))
