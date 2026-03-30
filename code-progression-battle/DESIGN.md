# Code Progression Battle - Design System

## 1. Color Palette

Deep navy/indigo ダークテーマをベースに、音楽制作ツールの雰囲気を持つカラーパレット。

```css
:root {
  /* Background layers */
  --bg-deepest: #06060f;
  --bg-base: #0c0c1e;
  --bg-surface: #141432;
  --bg-elevated: #1c1c44;
  --bg-hover: #24245a;

  /* Border */
  --border-subtle: #2a2a5a;
  --border-default: #3a3a7a;
  --border-strong: #5a5aaa;

  /* Text */
  --text-primary: #e8e8f0;
  --text-secondary: #9090b0;
  --text-muted: #606080;

  /* Accent */
  --accent-primary: #a78bfa;     /* purple - メインアクセント */
  --accent-secondary: #60a5fa;   /* blue - セカンダリ */
  --accent-warm: #fbbf24;        /* amber - ハイライト */

  /* Semantic */
  --success: #34d399;
  --error: #f87171;
  --warning: #fbbf24;

  /* Player */
  --player-bg: #0a0a1a;
  --player-progress: #a78bfa;
  --player-button: #e8e8f0;
}
```

## 2. Chord Root Color Mapping

rechord.cc を参考に、ルート音ごとに色を割り当て。ダークテーマに映える彩度・明度に調整。

| Root | Color Name | Background | Text | Border |
|------|-----------|------------|------|--------|
| C    | Red       | `#3d1520` | `#f87171` | `#7f1d1d` |
| C#/Db| Red-Orange| `#3d1f15` | `#fb923c` | `#7f3d1d` |
| D    | Orange    | `#3d2a15` | `#fbbf24` | `#7f5a1d` |
| D#/Eb| Yellow-Orange | `#3d3315` | `#fde047` | `#7f6d1d` |
| E    | Yellow    | `#333d15` | `#a3e635` | `#5a7f1d` |
| F    | Green     | `#153d20` | `#34d399` | `#1d7f3d` |
| F#/Gb| Teal      | `#153d33` | `#2dd4bf` | `#1d7f6d` |
| G    | Cyan      | `#152a3d` | `#22d3ee` | `#1d5a7f` |
| G#/Ab| Blue      | `#15203d` | `#60a5fa` | `#1d3d7f` |
| A    | Indigo    | `#1f153d` | `#818cf8` | `#3d1d7f` |
| A#/Bb| Purple    | `#2a153d` | `#a78bfa` | `#5a1d7f` |
| B    | Violet    | `#33153d` | `#c084fc` | `#6d1d7f` |

各コードチップは `background` + `border` で囲み、コード名を `text` 色で表示する。

## 3. Typography

```
Primary: 'Inter' (UI text, labels)
Monospace: 'JetBrains Mono' (chord input, code-like elements)
Display: 'Space Grotesk' (headings, thread titles)
```

Google Fonts import:
```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&display=swap
```

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page title | Space Grotesk | 700 | 1.75rem |
| Thread title | Space Grotesk | 500 | 1.25rem |
| Body text | Inter | 400 | 0.95rem |
| Chord text | JetBrains Mono | 500 | 0.9rem |
| Label/caption | Inter | 500 | 0.8rem |
| Button | Inter | 600 | 0.85rem |

## 4. Screen Layouts

### 4-1. Thread List Page (`/`)

```
+--------------------------------------------------+
|  HEADER: Logo + "Code Progression Battle"  [Auth] |
+--------------------------------------------------+
|                                                    |
|  [+ New Thread]                    [Sort/Filter]   |
|                                                    |
|  +----------------------------------------------+ |
|  | Thread Card                                   | |
|  | "Midnight Jazz Session"          Key: Cm      | |
|  | @user1 vs @user2    4/4  BPM:120   8 posts   | |
|  | [Am7] [Dm7] [G7] [Cmaj7]  <- last chords     | |
|  +----------------------------------------------+ |
|  | Thread Card                                   | |
|  | ...                                           | |
|  +----------------------------------------------+ |
|                                                    |
+--------------------------------------------------+
```

- カード形式のリスト。最後に投稿されたコード進行をプレビュー表示
- 各カードはホバーで `--bg-hover` に変化
- Key / BPM / 拍子はバッジ表示

### 4-2. Thread Detail Page (`/thread/:id`)

```
+--------------------------------------------------+
|  HEADER: <- Back   "Thread Title"    Key:Am 4/4   |
+--------------------------------------------------+
|                                                    |
|  +--- Post (user1, left-aligned) ---------------+ |
|  | @user1  2024-03-20 12:00                      | |
|  | | Am7    | Dm7    | G7     | Cmaj7  |         | |
|  | | Fmaj7  | Bm7b5  | E7     | Am7    |         | |
|  | "ジャズっぽく始めてみた"                         | |
|  +----------------------------------------------+ |
|                                                    |
|         +--- Post (user2, right-aligned) -------+ |
|         | @user2  2024-03-20 13:30               | |
|         | | Dm7    | G7     | Em7    | Am7    |  | |
|         | | Dm7    | G7     | Cmaj7  |  %     |  | |
|         | "いいね！ツーファイブで返すよ"              | |
|         +----------------------------------------+ |
|                                                    |
|  ... (scrollable)                                  |
|                                                    |
+--------------------------------------------------+
|  CHORD INPUT AREA                                  |
|  +----------------------------------------------+ |
|  | | Am7  | Dm7  | G7  | Cmaj7  |              | |
|  +----------------------------------------------+ |
|  | テキスト入力: "Am7 | Dm7 | G7 | Cmaj7"       | |
|  | [コメント入力...]              [Submit]        | |
|  +----------------------------------------------+ |
+--------------------------------------------------+
|  PLAYER BAR (固定)                                 |
|  [<<] [Play/Pause] [>>]  ====o========  1:23/3:45 |
|  BPM: 120                                         |
+--------------------------------------------------+
```

- 2人の投稿がチャット形式で交互に並ぶ（左/右寄せ）
- 各投稿内のコードチップはルート音で色分け
- 小節区切り `|` はグレー線で表示
- コード入力はテキスト入力 → リアルタイムでコードチップに変換してプレビュー
- 再生バーは viewport 下部に固定（sticky）

### 4-3. Thread Create Modal

```
+------------------------------------------+
|  New Thread                          [X]  |
+------------------------------------------+
|                                           |
|  Title:  [______________________________] |
|                                           |
|  Key:    [C ▼] [Major ▼]                 |
|                                           |
|  Time:   [4 ▼] / [4 ▼]                   |
|                                           |
|  BPM:    [120_____]                       |
|                                           |
|  Invite: [@username____________]          |
|                                           |
|          [Cancel]  [Create Thread]        |
+------------------------------------------+
```

- 中央モーダル、背景は半透明オーバーレイ
- Key は root + quality（Major/Minor/etc）のセレクト
- BPM はテキスト入力（40-300 のバリデーション）

## 5. Component Design Specs

### 5-1. Chord Chip

コード進行内の個々のコードを表示するチップ。

- Size: `min-width: 64px`, `height: 36px`, `padding: 4px 12px`
- Border: `1px solid`, ルート音対応の border color
- Border radius: `6px`
- Background: ルート音対応の bg color（低彩度）
- Font: JetBrains Mono 500, ルート音対応の text color
- Hover: border を 1段明るく

### 5-2. Measure Bar

小節を区切るバー。コードチップの間に配置。

- Width: `2px`
- Color: `var(--border-subtle)`
- Height: 小節の高さに合わせる
- 小節番号を上部に小さく表示（`var(--text-muted)`, 0.7rem）

### 5-3. Post Card

スレッド内の各投稿。

- Max width: `75%` of container
- Background: `var(--bg-surface)`
- Border: `1px solid var(--border-subtle)`
- Border radius: `12px`
- Padding: `16px`
- User 1 (左寄せ): `border-left: 3px solid var(--accent-primary)`
- User 2 (右寄せ): `border-right: 3px solid var(--accent-secondary)`
- Shadow: `0 2px 8px rgba(0,0,0,0.3)`

### 5-4. Player Bar

画面下部に固定される再生コントロール。

- Position: `fixed`, `bottom: 0`, `width: 100%`
- Height: `72px`
- Background: `var(--player-bg)` with `backdrop-filter: blur(12px)`
- Border top: `1px solid var(--border-subtle)`
- Play button: 円形, `48px`, `var(--accent-primary)` bg
- Progress bar: `4px` height, `var(--player-progress)` fill
- Seek handle: `12px` circle, `var(--text-primary)`

### 5-5. Thread Card

スレッド一覧の各カード。

- Background: `var(--bg-surface)`
- Border: `1px solid var(--border-subtle)`
- Border radius: `12px`
- Padding: `16px 20px`
- Hover: `background: var(--bg-hover)`, `border-color: var(--border-default)`
- Transition: `all 0.2s ease`
- 下部にコードチップのプレビュー行

### 5-6. Chord Input

コード入力エリア。

- テキスト入力: `font-family: JetBrains Mono`, `bg: var(--bg-base)`, `border: var(--border-default)`
- プレビュー行: 入力に応じてリアルタイムでコードチップを表示
- Submit ボタン: `bg: var(--accent-primary)`, `border-radius: 8px`, `font-weight: 600`

### 5-7. Badge

Key, BPM, 拍子などのメタ情報表示。

- Padding: `2px 8px`
- Border radius: `4px`
- Font: Inter 500, 0.75rem
- Background: `var(--bg-elevated)`
- Border: `1px solid var(--border-subtle)`
- Color: `var(--text-secondary)`
