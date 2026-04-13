# irasutoya-index

`doubutsu-quiz` の「インスタント絵本」「なぜなにAI」モード用に、いらすとや
全記事のメタデータ（タイトル・説明・画像URL・カテゴリ）をオフラインで収集す
るツール。

いらすとや.com に直接アクセスせず、**Common Crawl** の公開アーカイブから該
当ページの HTML を抽出する。

## 仕組み

1. **CDX API は使わない**
   `https://index.commoncrawl.org/` の CDX HTTP API は過負荷でほぼ常に 504 を
   返す。その代わり、各クロールの `cluster.idx`（SURT ソート済みインデック
   スファイル）を S3 から直接読み、`com,irasutoya)` プレフィックスに該当す
   る `cdx-NNNNN.gz` シャード内のブロックだけを **Range リクエスト**で取得
   する（～数百 KB）。
2. **ブロックをマルチメンバー gzip として展開**
   `cdx-NNNNN.gz` の各ブロックは独立した gzip メンバーになっているので、
   `zlib` で順次展開して行単位に分割する。
3. **URL 重複排除**
   同一 URL が複数クロールで出現した場合はタイムスタンプの新しい方を採用。
4. **WARC Range 取得**
   CDX 行に含まれる `filename / offset / length` を使って
   `https://data.commoncrawl.org/{filename}` に Range リクエストし、
   `warcio` で該当レコードだけをパース。
5. **HTML 解析**
   `BeautifulSoup4` で以下を抽出:
   - `title`（`og:title` 優先、なければ `<title>` からサイト名サフィックス除去）
   - `description`（`div.entry` 内のテキスト）
   - `image_urls`（`div.entry` 内の Blogger 画像 URL を `/s1600/` にリサイズ）
   - `categories`（`div.entry a[rel=tag]`）
   - `published_at`（URL の `/YYYY/MM/` 部分から導出）
6. **JSON 出力**
   `output/irasutoya_index.json` に全件書き出し。

## セットアップ

```bash
cd doubutsu-quiz/tools/irasutoya-index
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 実行

### サンプル（最初の 100 件）

```bash
.venv/bin/python -m src.main \
    --collection CC-MAIN-2024-51 \
    --limit 100
```

### 複数クロール＋全量

```bash
.venv/bin/python -m src.main \
    --collection CC-MAIN-2024-51 \
    --collection CC-MAIN-2025-47 \
    --workers 16
```

主なオプション:

| オプション | 説明 |
|-----------|------|
| `--collection <ID>` | 対象 CC クロール。複数指定可。 |
| `--limit N` | 先頭 N 件だけ処理（サンプル実行用） |
| `--workers N` | WARC Range 取得の並列度（デフォルト 8） |
| `--output PATH` | 出力 JSON の保存先 |
| `--log-level` | `DEBUG` / `INFO` / `WARNING` |

## 出力フォーマット

```json
{
  "version": "CC-MAIN-2024-51",
  "generated_at": "2026-04-12T...",
  "total_entries": 3000,
  "entries": [
    {
      "id": "irasutoya_2015_05_blog_post_235_html",
      "page_url": "https://www.irasutoya.com/2015/05/blog-post_235.html",
      "title": "「広告掲載商品」のイラスト文字",
      "description": "オレンジ色の下地に、「広告掲載商品」と大きく描かれたPOP用のイラスト文字です。",
      "image_urls": ["https://blogger.googleusercontent.com/.../s1600/pop_koukoku_keisai_syouhin.png"],
      "categories": ["POP", "リクエスト"],
      "published_at": "2015-05"
    }
  ]
}
```

## キャッシュ

- `cache/<collection>.cluster.idx` にクロールごとの cluster.idx をキャッシュ
  （~120 MB）。削除すれば次回再ダウンロードする。

## 未解決・注意点

- **Common Crawl の CDX カバレッジ**: 単一クロールでは全記事が取れない可能
  性あり。複数クロールを合算すると取りこぼしが減る。
- **サイト移行**: いらすとやは一部記事で URL 構造が変わる場合がある。
  `is_article_url` は `/YYYY/MM/*.html` のみ許可しているため、それ以外の記
  事パス（あれば）は取りこぼす。
- **画像解像度**: Blogger URL の `/sNNNN/` 部分を `/s1600/` に書き換えてい
  る。原本より大きい値を指定した場合、Blogger はそのまま原寸返却する。
