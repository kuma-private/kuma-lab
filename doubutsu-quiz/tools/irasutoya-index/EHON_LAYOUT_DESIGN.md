# インスタント絵本 レイアウトシステム設計

**Author**: Eng G (設計担当)
**Date**: 2026-04-10
**Status**: Draft (Eng F の並行実装への差し替え影響あり)
**Scope**: 設計のみ。実装コードは含まない。

---

## 0. 背景と目的

既存の `doubutsu-quiz/backend/src/DoubutsuQuiz.Api/Ehon/` は「1ページ = 1画像 + テキスト」
前提で実装されている（Eng F が並行実装中）。

ユーザー要望: 「桃太郎の川に桃が流れ、両脇にじじばば」のように **複数のいらすとや画像を
空間配置したコンポジション** を 1 ページとして表現したい。

本文書は以下を定義する:

1. **レイアウトテンプレート**（スロット構造 + JSON スキーマ）
2. **テンプレート選択ロジック**（Claude にどう選ばせるか）
3. **Claude プロンプト戦略**（ストーリーとレイアウトを同時に生成）
4. **スロット → いらすとや画像検索** のマッピング方針
5. **API レスポンス形式**
6. **フロントエンド レンダリング方針**
7. **既知の難所と対処方針**
8. **MVP vs v2 の切り分け**
9. **Eng F 実装への差し替え影響範囲**

---

## 1. レイアウトテンプレート定義

### 1.1 コンセプト

- テンプレートは **固定カタログ**（Claude が自由にレイアウト設計するのは MVP では禁止）
- 各テンプレートは 0-1 正規化座標のキャンバス（左上 0,0 / 右下 1,1）上に **スロット** を持つ
- スロットは `background` / `character` / `object` / `decoration` の 4 種
- 各スロットは `search_hint`（どんなカテゴリの画像が入るべきかのメタ情報）を持ち、
  Claude が検索キーワードを割り当てる際の「型」になる

### 1.2 スロットの属性（JSON スキーマ）

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "title": "EhonLayoutTemplate",
  "type": "object",
  "required": ["id", "displayName", "description", "aspectRatio", "slots"],
  "properties": {
    "id": {
      "type": "string",
      "description": "テンプレートID（例: trio-river, duo-forest）",
      "pattern": "^[a-z][a-z0-9-]*$"
    },
    "displayName": { "type": "string" },
    "description": {
      "type": "string",
      "description": "Claudeが選択判断するための説明文。どんな場面で使うか"
    },
    "aspectRatio": {
      "type": "string",
      "enum": ["16:9", "4:3", "1:1", "3:4"],
      "description": "基本アスペクト比。デバイスにより拡縮される"
    },
    "slots": {
      "type": "array",
      "minItems": 1,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["id", "role", "position", "zIndex", "searchHint"],
        "properties": {
          "id": {
            "type": "string",
            "description": "テンプレート内で一意（例: bg, center, left, right）"
          },
          "role": {
            "type": "string",
            "enum": ["background", "character", "object", "decoration"]
          },
          "position": {
            "type": "object",
            "required": ["x", "y", "width", "height"],
            "properties": {
              "x":      { "type": "number", "minimum": 0, "maximum": 1 },
              "y":      { "type": "number", "minimum": 0, "maximum": 1 },
              "width":  { "type": "number", "minimum": 0, "maximum": 1 },
              "height": { "type": "number", "minimum": 0, "maximum": 1 }
            }
          },
          "zIndex": {
            "type": "integer",
            "description": "重ね順。0が最背面"
          },
          "searchHint": {
            "type": "string",
            "description": "この枠に入る画像の意味カテゴリ（例: 人物, 動物, 自然物, 乗り物, 建物, 食べ物）。Claudeへ渡す指示とフォールバック判定に使う"
          },
          "flipAllowed": {
            "type": "boolean",
            "default": true,
            "description": "画像を水平反転して良いか（対面構図のため）"
          },
          "fit": {
            "type": "string",
            "enum": ["contain", "cover"],
            "default": "contain",
            "description": "スロット枠への収め方"
          }
        }
      }
    }
  }
}
```

### 1.3 MVP カタログ（7 テンプレート）

Claude が選択する候補として以下を用意する。各テンプレートは JSON ファイル（または F# の
static list）として静的定義する。

| ID | displayName | 用途 | スロット構成 |
|----|-------------|------|--------------|
| `solo-hero` | ひとり主人公 | 主人公の紹介、感情表現 | bg(背景) + center(人物/動物) |
| `duo-face` | ふたり対面 | 対話、挨拶、出会い | bg + left(人物) + right(人物) |
| `trio-river` | 川にはさまれた三者 | 桃太郎的構図 | bg(川) + center(物体) + left(人物) + right(人物) |
| `hero-and-object` | 主人公とアイテム | 発見、入手、捜索 | bg + left(人物) + right(物体) |
| `crowd-town` | 賑やかな場面 | 村・町・集まり | bg(建物/風景) + far-left(人物) + center(人物) + far-right(人物) + front(物体) |
| `journey-path` | 道のり | 移動、旅、出発 | bg(道/自然) + center(人物) + top-right(空の物体 例: 雲/鳥) |
| `reveal` | 発見/驚き | クライマックス、気づき | bg + center-large(主役物体 or キャラ) + small-bottom(人物) |

### 1.4 代表例: `trio-river` の具体値

```json
{
  "id": "trio-river",
  "displayName": "川にはさまれた三者",
  "description": "川や海の背景の中央に物体が流れていて、左右に人物がいる構図。桃太郎の川と桃とじじばばのようなシーン",
  "aspectRatio": "4:3",
  "slots": [
    {
      "id": "bg",
      "role": "background",
      "position": { "x": 0, "y": 0, "width": 1, "height": 1 },
      "zIndex": 0,
      "searchHint": "自然風景（川 海 水辺 など）",
      "flipAllowed": false,
      "fit": "cover"
    },
    {
      "id": "center",
      "role": "object",
      "position": { "x": 0.38, "y": 0.40, "width": 0.24, "height": 0.28 },
      "zIndex": 2,
      "searchHint": "物体（ストーリーの鍵となる物）",
      "flipAllowed": false,
      "fit": "contain"
    },
    {
      "id": "left",
      "role": "character",
      "position": { "x": 0.02, "y": 0.45, "width": 0.28, "height": 0.50 },
      "zIndex": 3,
      "searchHint": "人物（向かって右向き推奨）",
      "flipAllowed": true,
      "fit": "contain"
    },
    {
      "id": "right",
      "role": "character",
      "position": { "x": 0.70, "y": 0.45, "width": 0.28, "height": 0.50 },
      "zIndex": 3,
      "searchHint": "人物（向かって左向き推奨）",
      "flipAllowed": true,
      "fit": "contain"
    }
  ]
}
```

---

## 2. テンプレート選択ロジック

### 2.1 選択肢

| 案 | 内容 | Pros | Cons |
|----|------|------|------|
| **A. Claude に ID を選ばせる** | プロンプトにテンプレート一覧を渡し、ページ毎に ID を選ばせる | 表現が安定、レンダリング側が単純、Claude が構図を誤ってもカタログ範囲内で収まる | テンプレート数が少ないと単調 |
| B. Claude に自由にレイアウト JSON を出させる | Claude が位置・サイズも出力 | 表現が豊か | 重なり・はみ出し・役割不整合のリスク、QA 不能 |
| C. ハイブリッド（Claude がテンプレ選 + 微調整） | 選んだテンプレの position を ±0.05 程度調整可 | 中間 | 複雑化、検証難 |

### 2.2 推奨: **案 A（Claude に ID を選ばせる）**

理由:

- MVP ではブレを抑え「とりあえず成立する絵本」を優先
- レイアウトバグは「画像が枠から外れる」「人物が川の下に潜る」のような **視覚的破綻** を
  起こしやすく、ユーザーに気づかれやすい。テンプレ固定なら破綻パターンは有限で QA 可能
- テンプレ数が足りないと感じたら v2 でカタログを増やせば漸進的に改善できる
- kuma-lab のルール「フォールバック・後方互換禁止」的には、Claude の生成結果を信頼しすぎる
  B 案は後続のサニタイズ分岐を呼びやすいため不適

---

## 3. Claude API への指示（プロンプト戦略）

### 3.1 生成すべきもの

Claude は 1 リクエストで以下を **tool_use** で構造化出力する:

- `title`: 絵本タイトル
- `pages[]`:
  - `pageNumber`
  - `text`: 本文（既存と同じく 1〜3 文ひらがな主体）
  - `templateId`: 上記カタログから選択
  - `slotQueries[]`: `{ slotId, query, reason }`
    - `slotId` はテンプレの定義と完全一致が必須
    - `query` は `IrasutoyaIndex.search` にそのまま渡せる日本語キーワード（スペース区切り）
    - `reason` はデバッグ用（なぜそのキーワードを選んだか 1 行）

### 3.2 システムプロンプト（雛形）

```
あなたは 5〜7 歳の子供向けの絵本作家 兼 レイアウトデザイナーです。
与えられた主人公・舞台・テーマから、短い絵本を作ります。

## ルール
- 各ページの本文は 1〜3 文の短いひらがな主体の文章にすること
- 漢字は小学1年生で習うもの（一・二・三・人・日・月 など）までに限定すること
- 各ページは別の場面を描写し、物語として繋がるようにすること
- 明るくやさしい物語にすること

## レイアウトのルール
- ページごとに、下記の「利用可能なテンプレート一覧」から最もふさわしい
  テンプレートを 1 つ選び templateId に書くこと
- 選んだテンプレートの slots すべてに対して slotQueries を埋めること
  （過不足があってはならない）
- slotQueries の query は、いらすとや検索に使う日本語の名詞キーワード
  （1〜3 語、スペース区切り）にすること
- role が character のスロットには「人物」「動物」など、いらすとやで
  見つかりやすい具体的な名詞を入れる（例: 「おじいさん」「くま」）
- role が background のスロットには「川」「森」「海」など風景系の名詞を入れる
- role が object のスロットには物の名詞（「桃」「宝箱」「花」）を入れる
- 同じ登場人物は同じキーワードを使い回し、絵の一貫性を保つこと

## 利用可能なテンプレート一覧
（ここに MVP カタログを JSON で全展開して渡す。displayName / description / slots の
role と searchHint まで含める。position 数値は不要）
```

### 3.3 Tool Schema（Claude に渡す関数定義）

```json
{
  "name": "generate_ehon_with_layout",
  "description": "Generate a short Japanese picture book with per-page layout selection",
  "input_schema": {
    "type": "object",
    "required": ["title", "pages"],
    "properties": {
      "title": { "type": "string" },
      "pages": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["pageNumber", "text", "templateId", "slotQueries"],
          "properties": {
            "pageNumber": { "type": "integer" },
            "text": { "type": "string" },
            "templateId": {
              "type": "string",
              "enum": ["solo-hero", "duo-face", "trio-river",
                       "hero-and-object", "crowd-town", "journey-path", "reveal"]
            },
            "slotQueries": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["slotId", "query"],
                "properties": {
                  "slotId": { "type": "string" },
                  "query":  { "type": "string" },
                  "reason": { "type": "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### 3.4 バリデーション（バックエンド側）

Claude の出力を受けた直後に以下を検証する。**NG なら即エラー。リトライもフォールバックもしない**（kuma-lab ルール）:

1. `templateId` がカタログに存在するか
2. `slotQueries` のすべての `slotId` が選んだテンプレのスロット集合と完全一致
   （過不足なし）
3. `query` が空でないこと

検証失敗時は HTTP 502 で `{ error: "Story layout validation failed: ..." }` を返す。

---

## 4. スロット → 画像検索のマッピング

### 4.1 検索の流れ

ページ単位で以下を行う:

```
for each page in story.pages:
    templ = templates[page.templateId]
    for each slot in templ.slots:
        query = page.slotQueries[slot.id].query
        hits  = IrasutoyaIndex.search(index, query, limit=20)
        entry = pickBestHit(hits, slot, usedIds, template)
        if entry is None: fail entire story with error
```

### 4.2 `pickBestHit` の方針

`IrasutoyaIndex.Entry` は `{Id, Title, Description, ImageUrls, Categories, ...}` を持つ。
これを活用してスコアリング:

| 指標 | 重み | 説明 |
|------|------|------|
| 検索ランク（既存 search の順位） | 基本 | 既存の search 関数にテキストマッチは任せる |
| `used.Contains(entry.Id)` | 除外 | 絵本全体で既使用の Id は除外（dedupe） |
| `slot.role == background` の場合 | +1 | `Categories` に「風景」「自然」「背景」を含むものを優先 |
| `slot.role == character` の場合 | +1 | `Categories` に「人物」「動物」「職業」を含むものを優先 |
| `ImageUrls.Length > 0` | 必須 | 空なら除外 |

MVP では「既存 search の 1 位をそのまま使う + dedupe のみ」で十分。スコアリングは v2。

### 4.3 0 件 / 不適切時の戦略

**重要**: kuma-lab ルールにより **フォールバック禁止**。

方針:

1. **0 件**: 即 502 エラーで絵本生成全体を失敗させる。
   レスポンス: `{ error: "Image not found for slot 'center' with query '桃'", page: 3 }`
2. **カテゴリ不一致だが hit あり**: MVP では許容（既存 search の 1 位をそのまま採用）。
   v2 でカテゴリスコアリングを追加
3. **リトライは禁止**: 同じ入力で Claude に再生成を依頼しない。
   呼び出し元（ユーザー / フロント）が再リクエストを投げ直す

これにより「絶対に動く保証のない画像が表示される」という中途半端な状態を排除し、
失敗は明確に失敗として扱う。

### 4.4 Dedupe

- `used = HashSet<string>()` を絵本 1 冊のスコープで持つ（既存 `ImageSelector` と同様）
- **ただし背景スロットは dedupe 対象から除外する**。同じ「川」背景が 2 ページ以上続くのは
  自然なため
- `role == background` のときは `used.Add` しない、`used.Contains` チェックも skip

---

## 5. レスポンス形式（API スキーマ）

`POST /api/ehon/generate` のレスポンス:

```json
{
  "title": "ももたろう",
  "protagonist": "ももたろう",
  "setting": "むかしのむら",
  "pages": [
    {
      "pageNumber": 1,
      "text": "むかしむかし、あるところに おじいさんと おばあさんが すんでいました。",
      "template": {
        "id": "duo-face",
        "aspectRatio": "4:3"
      },
      "slots": [
        {
          "id": "bg",
          "role": "background",
          "position": { "x": 0, "y": 0, "width": 1, "height": 1 },
          "zIndex": 0,
          "fit": "cover",
          "flip": false,
          "image": {
            "id": "irasutoya_2016_03_blog_post_kawa_html",
            "imageUrl": "https://blogger.../s1600/bg_kawa.png",
            "title": "川のイラスト",
            "pageUrl": "https://www.irasutoya.com/..."
          }
        },
        {
          "id": "left",
          "role": "character",
          "position": { "x": 0.02, "y": 0.45, "width": 0.28, "height": 0.50 },
          "zIndex": 3,
          "fit": "contain",
          "flip": false,
          "image": { "id": "...", "imageUrl": "...", "title": "おじいさん" }
        },
        {
          "id": "right",
          "role": "character",
          "position": { "x": 0.70, "y": 0.45, "width": 0.28, "height": 0.50 },
          "zIndex": 3,
          "fit": "contain",
          "flip": true,
          "image": { "id": "...", "imageUrl": "...", "title": "おばあさん" }
        }
      ]
    }
  ]
}
```

### 5.1 なぜ position を各ページのレスポンスに含めるか

- フロントエンドはテンプレ定義を知らなくて済む（バックエンドが解決済みの position を渡す）
- テンプレカタログの変更時に、古いレスポンスでも再現可能
- テンプレ ID はデバッグ・ログ用としてだけ含める

---

## 6. フロントエンドのレンダリング方針

### 6.1 3 つの案

| 案 | アプローチ | Pros | Cons |
|----|-----------|------|------|
| **A. CSS absolute positioning** | 親 div に `position:relative; aspect-ratio: 4/3`、子 `<img>` を `position:absolute; left:%; top:%; width:%; height:%; object-fit:contain` | 実装が最短、Svelte と相性良、レスポンシブ自動、アクセシビリティ（alt）簡単、DOM で inspect 可 | 画像の合成（ブレンド、グラデ）に弱い |
| B. SVG `<image>` | `<svg viewBox="0 0 1000 750">` 内に `<image>` 配置 | viewBox でスケーリング厳密、フィルタ・マスク可能 | PNG の `<image>` はブラウザ間でサイズ挙動が微妙、alt 対応が冗長 |
| C. Canvas 合成 | `OffscreenCanvas` または `<canvas>` に drawImage | ピクセル完璧、エクスポート（PNG 保存）可能 | 実装量多、CORS で blogger 画像を drawImage するとタイント問題、アクセシビリティ不可 |

### 6.2 推奨: **案 A（CSS absolute positioning）**

- MVP の実装コスト最小
- Svelte コンポーネント構造スケッチ:

```
<EhonPage page={...}>
  <div class="canvas" style="aspect-ratio: {aspectRatio}">
    {#each page.slots as slot (slot.id)}
      <img
        src={slot.image.imageUrl}
        alt={slot.image.title}
        class="slot slot-{slot.role}"
        class:flipped={slot.flip}
        style="
          left:   {slot.position.x * 100}%;
          top:    {slot.position.y * 100}%;
          width:  {slot.position.width * 100}%;
          height: {slot.position.height * 100}%;
          z-index: {slot.zIndex};
          object-fit: {slot.fit};
        "
      />
    {/each}
  </div>
  <p class="text">{page.text}</p>
</EhonPage>
```

### 6.3 いらすとや画像の透過問題

- いらすとやの PNG は **白背景ではなく透過背景** のものが多い（キャラクター系）
- しかし `role == background` の画像は透過でないことが多い（風景絵）
- MVP: 透過は画像次第で **何もしない**（CSS で mix-blend-mode も使わない）
- 白背景の character が出た場合は見た目上「白い箱が前景にある」ようになる
  → 該当する絵は search スコアで除外する…のは v2。MVP では許容

### 6.4 画面サイズ対応

- **親 div に `aspect-ratio: 4/3`** を指定し、幅は画面に応じて 100% or 可変
- スマホ縦: 幅 100vw、テキストは下に積む
- タブレット横: 幅 80vw 程度、テキストは右に並べる
- ブレークポイント: `@media (min-width: 768px)` で横並びに切り替え

---

## 7. 既知の難所と対処方針

### 7.1 画像の元サイズがバラバラ

- いらすとやは 正方形／横長／縦長 が混在
- 対処: スロットに `fit: "contain"` を既定とし、CSS `object-fit: contain` で枠内に収める
- 余白は白／透過で埋まる。キャンバスの背景色は白または薄いクリーム
- `fit: "cover"` は背景スロット専用（全面埋めたい）

### 7.2 キャラクターの向き

- いらすとやの人物は向きを選べない（「おじいさん」で検索しても左向き右向きどちらが返るか不定）
- 対処 MVP: スロットに `flipAllowed: true` を設定し、レンダリング時に CSS
  `transform: scaleX(-1)` を条件付きで適用。フリップ判断は **バックエンドでランダム or 固定ルール**（例: `right` スロットは常に flip）
- v2: いらすとやのタイトル／説明から向きを推測（「○○さん 左向き」のような表記がある場合）

### 7.3 「風景全体」画像の欠如

- いらすとやは人物・物体アイコンが主で、「広大な川」のような背景絵は少ない
- 対処:
  - カテゴリ「背景」「フレーム」「壁紙」を優先ソース扱いにする
  - MVP ではヒットしないときは 502 エラーで素直に落とす
  - v2: グラデーション CSS 背景 + 小さな水のアイコンで合成するプリセットを追加

### 7.4 テンプレート不足

- 7 種では絵本 5 ページ分の多様性が足りない可能性
- 拡張戦略:
  - **追加ルート**: `templates/*.json` ディレクトリを作り、JSON ファイルを追加するだけで
    増やせる構造にしておく
  - Claude の tool schema の `enum` は F# 起動時に動的生成（templates ディレクトリから読み込み）
  - 7 種 → 15 種 → 30 種と MVP リリース後に増やす計画

### 7.5 Claude のテンプレ選択ミス

- 例: 主人公 1 人の紹介ページに `crowd-town`（5 スロット要求）を選んでしまう
- 対処:
  - バリデーションで slotQueries の数は必ず合わせさせる（不足 → 502）
  - プロンプトの「利用可能なテンプレート一覧」に各 template の `description` を
    具体例付きで書き込む（「`solo-hero` = 主人公 1 人の紹介、感情、決意」）
  - v2: 選択肢に合わない場合の「penalty pattern」をログに蓄積して改善

---

## 8. MVP vs v2 の切り分け

### 8.1 MVP（今回のブランチで出す）

- テンプレートカタログ 7 種
- Claude による templateId 選択 + slotQueries 生成（tool_use）
- バックエンドでのバリデーション（templateId / slotId 整合性）
- `IrasutoyaIndex.search` の 1 位採用 + 背景以外 dedupe
- レスポンスに position 解決済みで返す
- フロントは CSS absolute positioning で描画
- 画像 0 件時は 502 エラーで絵本全体失敗
- `flip` は `right` スロット固定ルール
- aspect ratio は 4:3 固定（全テンプレ）

### 8.2 v2 以降

- テンプレートカタログ 15〜30 種
- カテゴリスコアリング（role ごとの重み付け）
- キャラクター向き自動判定
- 白背景画像の除外
- アニメーション（ページ遷移、スロットの軽いモーション）
- BGM（ai-sing 由来の簡易 BGM）
- 画像変形（scale・rotate のバリエーション）
- プリセット背景（グラデ CSS + アイコン合成）
- Claude がテンプレを選べなかった場合の拡張案（案 C ハイブリッド）

---

## 9. Eng F 実装への影響

### 9.1 現状把握（2026-04-10 時点）

Eng F 実装:

- `backend/src/DoubutsuQuiz.Api/Ehon/StoryGenerator.fs`
  - `StoryPage = { PageNumber; Text; SceneKeywords }`
  - Anthropic tool_use で `{title, pages[{page_number,text,scene_keywords}]}` を取得
- `backend/src/DoubutsuQuiz.Api/Ehon/ImageSelector.fs`
  - `selectForPage index used page` → `Entry option`
  - 1 ページ 1 画像前提
- `backend/src/DoubutsuQuiz.Api/Ehon/Handlers.fs`
  - レスポンスは `{ pageNumber, text, sceneKeywords, image: {...}|null }` 平坦構造

### 9.2 差し替え対象と見積もり

| ファイル | 変更内容 | 作業量 |
|----------|---------|--------|
| `StoryGenerator.fs` | `StoryPage` 型に `TemplateId` と `SlotQueries` 追加、systemPrompt 全面書き換え、tool schema を新スキーマに差し替え、parseStory を新構造へ、Claude 出力のバリデーション追加 | **中** |
| `ImageSelector.fs` | `selectForPage` → `selectForPageWithLayout` に差し替え。1 ページ 1 画像でなく、スロットごとに search して Entry を割り当てる。背景 dedupe 除外ロジック。失敗時は Result で返す | **中** |
| `Handlers.fs` | レスポンス DTO を 1 画像フラット構造からスロット配列構造へ。position の解決（テンプレカタログ参照）をここで行う。画像 not found 時の 502 返却 | **小〜中** |
| `Ehon/LayoutTemplates.fs`（新規） | 7 テンプレのカタログ定義（static）、id → template lookup、tool schema の enum 動的生成 | **小** |
| 既存の `StoryPage.SceneKeywords` を参照するコード | 完全に置き換わるため使用箇所ゼロにする | **小** |
| フロントエンド（別リポジトリ/別ファイル） | 本設計の § 6.2 スケッチで新規コンポーネント。既存の 1 画像前提コンポーネントは捨てる | **中** |

**総合規模: 中**

- 型変更と Claude プロンプト差し替えは確実だが、ファイル数は少なく影響範囲は Ehon モジュール内に閉じる
- Quiz 系や Auth 系への波及なし
- Eng F が既に持っている「Claude tool_use 呼び出しの骨格」「IrasutoyaIndex.search 統合」
  「レスポンスハンドラの雛形」は再利用できるため、ゼロから書くよりは大幅に楽
- 見積もり: Eng A/B/C の 3 名で 0.5〜1 日（QA 込み）

### 9.3 差し替え手順（推奨順序）

1. `LayoutTemplates.fs` を新規追加（カタログ定義のみ。コードは動かない状態で OK）
2. `StoryGenerator.fs` の型と parseStory をレイアウト対応に書き換え、プロンプトを更新
3. `ImageSelector.fs` をスロット対応に差し替え
4. `Handlers.fs` のレスポンス DTO を差し替え
5. `svelte-check --threshold error` 相当（F# なら `dotnet build`）
6. バックエンド再起動 → 手動で `/api/ehon/generate` に POST して JSON 構造確認
7. フロント新コンポーネントを繋ぎ、ブラウザで絵本表示を目視確認（kuma-lab ルールにより必須）

---

## 10. 未解決・判断必要点

ユーザーに確認したい事項:

1. **テンプレート数 7 で MVP 十分か？**
   足りないと感じたら初手で 10〜12 に増やす判断をしたい
2. **aspect ratio 固定 4:3 で良いか？**
   スマホ縦表示時にテキスト下配置を想定しているが、9:16 縦長テンプレも MVP で欲しいか
3. **画像 0 件時の挙動**: 502 で絵本全体失敗としているが、
   「該当ページだけ画像なしで本文表示」のような妥協案が欲しいか（kuma-lab ルール的には
   フォールバック禁止なので避けたいが、ユーザー体験上の許容範囲を確認したい）
4. **dedupe 範囲**: 背景は dedupe しない方針だが、character スロット（人物）を
   「同じ主人公は同じ画像を使い回したい」場合は既存 dedupe 方針と衝突する。
   character は「同じクエリ → 同じ画像」を許容する方針で良いか
   （dedupe は object と他 role のみにする？）
5. **flip ルール**: `right` スロットを常に flip する固定ルールは乱暴。
   MVP で良いか、それとも Claude に flip を決めさせるか
6. **Eng F の現在作業状況**: 本文書で示した差し替えは Eng F が実装中の PR を直接巻き取る
   形になる。Eng F にどう引き継ぐか（本文書を渡して追加タスクにするか、新規 PR で
   置き換えるか）
7. **テンプレカタログの保管先**: F# ソース内 hardcode か、
   `Ehon/templates/*.json` のファイル分離か。後者だと hot-reload や Python スクリプトでの
   生成が可能
8. **5 歳児テスト**: 実装後に「3 スロット以上のページが本当に絵本として読めるか」を
   誰がどう評価するか（UI/UX Reviewer を呼ぶ？）
