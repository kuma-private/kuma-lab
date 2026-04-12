# Cadenza Bridge Architecture

**Status**: Epic #68 (feature/cadenza-bridge-epic ブランチで実装中)
**Last updated**: 2026-04-12
**Scope**: 全面的な Web DAW 化スプリント (約 3 ヶ月)

---

## 1. Context

Cadenza.fm は Svelte 5 + Tone.js の Web アプリで、コード進行と AI MIDI 生成によるスケッチ作成ができる。2026 年 4 月の EDM シナリオテストで「フィルタースイープ・サイドチェイン・本物のシンセが無いと音楽が完成しない」という限界が明確になった。

ブラウザから直接 VST3/CLAP プラグインをロードすることは原理的に不可能 — ブラウザサンドボックスはネイティブコード (dylib/DLL) を実行できないため、`File System Access API` で `.vst3` のバイト列を読めても、それを起動する手段が無い。唯一の現実解は **ローカル常駐のネイティブアプリ** を用意し、ブラウザから WebSocket 経由で制御することである。

この文書は、その解決策である **Cadenza Bridge** (Rust 製ネイティブアプリ) の設計仕様を記録する。

## 2. Goal

- Web DAW レベルの音質を実現する (本物の VST3 / CLAP プラグインをホスト)
- Mixer / Automation タブを UI として追加する
- 自然言語で Mixer を編集できる AI アシスタント機能を提供する
- 既存 Free 機能 (Flow / Text / Visualizer / Tone.js 再生) の完全な非破壊を保証する
- Premium Plan の収益化ポイントとする

## 3. Architecture Overview

```
┌───────────────────────────────────────────────┐
│      Cadenza Web (Svelte 5, TypeScript)       │
│                                               │
│  ・Free: Flow/Text/Visualizer + Tone.js       │
│  ・Premium: + Mixer/Automation (要 Bridge)    │
│                                               │
│  State source of truth                        │
│  Firestore sync (既存)                        │
│  Google OAuth cookie (既存)                   │
│  WS client (auto-reconnect, port 7890-7899)   │
│  JSON Patch applier                           │
│  Claude API client (Mixer/Automation suggest) │
└────────────────┬──────────────────────────────┘
                 │ ws://localhost:7890 (JSON)
┌────────────────▼──────────────────────────────┐
│       Cadenza Bridge (Rust native)            │
│                                               │
│  ・tokio + tokio-tungstenite (WS server)      │
│  ・cpal (audio I/O, CoreAudio/WASAPI)         │
│  ・clack-host (CLAP plugin host, Rust)        │
│  ・C++ shim (VST3 SDK wrapping)               │
│  ・Stateless — receives JSON Patch only       │
│  ・tray-icon (menu bar / system tray)         │
│  ・SMAppService / HKCU Run (auto-start)       │
│  ・Watchdog (exponential backoff restart)     │
│  ・self_update (GitHub Releases)              │
└────────────────┬──────────────────────────────┘
                 │
                 ▼ system audio (direct output)
              スピーカー

                 ▲
                 │ HTTPS (entitlement only)
┌────────────────┴──────────────────────────────┐
│    Cadenza Backend (F# ASP.NET Core)          │
│  ・POST /api/bridge/ticket (cookie auth)      │
│  ・POST /api/bridge/verify-ticket (Bridge)    │
│  ・POST /api/mixer/suggest (Claude)           │
│  ・POST /api/automation/suggest (Claude)      │
│  ・Firestore (users.tier, songs.chain, ...)   │
└───────────────────────────────────────────────┘
```

### 主要原則

1. **Web is source of truth**. Bridge はステートレスなレンダラで、Firestore を触らない
2. **Bridge 無しでも Free 機能は完全動作**。Bridge は Premium 拡張
3. **Protocol は JSON over WebSocket**、RPC (id 相関) + push event、JSON Patch で増分更新
4. **認証は per-command**。handshake は無認証、VST ロード等で検証
5. **音声は Bridge 直接出力**。WebRTC ストリーミングしない
6. **マルチタブは最新接続勝ち**。過去接続を切断するだけの簡潔モデル

## 4. Plan Matrix

| 機能 | Free | Premium |
|---|---|---|
| コード作成 / AI MIDI 生成 | ✓ | ✓ |
| Flow / Text / Visualizer タブ | ✓ | ✓ |
| Tone.js 再生 | ✓ | ✓ |
| MIDI エクスポート | ✓ | ✓ |
| **Mixer タブ** (Bridge 経由) | ✗ | ✓ |
| **Automation タブ** (Bridge 経由) | ✗ | ✓ |
| **VST3 / CLAP ホスティング** | ✗ | ✓ |
| **自然言語 Mixer 編集** | ✗ | ✓ |
| **WAV 高品質エクスポート** | ✗ | ✓ |

Free ユーザーには Mixer/Automation タブ自体が UI に表示されない。Premium ユーザーで Bridge が起動していない場合、タブは grey out され「Bridge を起動してください」の CTA が表示される。

## 5. Repository Layout

```
/Users/kuma/repos/kuma/kuma-lab/
├── tamekoma-night/           ← 既存 Cadenza Web
│   ├── frontend/             Svelte 5, TypeScript, Vite
│   ├── backend/              F# ASP.NET Core
│   └── docs/                 ← 本文書を含む
└── cadenza-bridge/           ← 新設: Rust Bridge workspace
    ├── Cargo.toml            workspace root
    ├── crates/
    │   ├── bridge-core       WS server, session, dispatcher
    │   ├── bridge-protocol   JSON message types, JSON Patch
    │   ├── bridge-audio      cpal stream, RT callback, ring buffers
    │   ├── bridge-plugin-host Graph engine, automation, render
    │   ├── bridge-clap       CLAP host via clack-host
    │   ├── bridge-vst3       C++ shim + Rust wrapper
    │   ├── bridge-ui-tray    menu bar / tray
    │   └── bridge-updater    GitHub Releases self-update
    ├── bin/cadenza-bridge.rs
    ├── tests/e2e/
    └── packaging/            mac .dmg + Windows .msi build scripts
```

## 6. Wire Protocol

### Envelope

```typescript
type Request  = { id: string; kind: 'request';  command: Command };
type Response = { id: string; kind: 'response'; ok: true;  result: unknown }
              | { id: string; kind: 'response'; ok: false; error: { code: ErrorCode; message: string } };
type Event    = { kind: 'event'; event: BridgeEvent };
type Message  = Request | Response | Event;
```

### Commands (browser → Bridge)

| Command | 用途 | Premium 必須 |
|---|---|---|
| `handshake` | プロトコルバージョン交換、bridgeVersion/updateAvailable 取得 | no |
| `session.verify` | ticket を渡して entitlement 確認 | no |
| `plugins.scan` | VST3/CLAP ディレクトリスキャン | no (結果は表示のみ) |
| `plugins.list` | キャッシュされたプラグインカタログ取得 | no |
| `project.load` | 全プロジェクト state を送信 | no (built-in のみ) |
| `project.patch` | JSON Patch で差分更新 | command 内容次第 |
| `project.hash` | 整合性チェック用 blake3 hash | no |
| `chain.addNode` | プラグインを chain に追加 | **yes (vst3/clap 時)** |
| `chain.removeNode` | chain から削除 | no |
| `chain.setParam` | パラメータ変更 | no |
| `chain.showEditor` | プラグイン GUI 表示 | yes |
| `chain.hideEditor` | プラグイン GUI 非表示 | yes |
| `transport.play` | 再生開始 | no |
| `transport.stop` | 停止 | no |
| `transport.seek` | シーク | no |
| `midi.noteOn/Off` | live 演奏 | no |
| `render.wav` | WAV ファイル書き出し | **yes** |
| `update.apply` | Bridge 自身の更新を適用 | no |
| `debug.sine` | 開発用 440Hz sine 出力 | no |

### Events (Bridge → browser)

| Event | 用途 | 頻度 |
|---|---|---|
| `handshake.ack` | bridgeVersion / capabilities / updateAvailable | 1 回 |
| `transport.position` | 再生位置 (tick + bar + beat) | 30 Hz during play |
| `transport.state` | playing/paused/stopped | state change |
| `level.meter` | track 別 peak/rms | 30 Hz during play |
| `chain.paramChanged` | プラグイン GUI で変更された値 | on change |
| `plugin.error` | プラグインクラッシュ等 | on error |
| `audio.deviceChanged` | オーディオデバイス切替 | on change |
| `update.progress` | 更新の download/install/restart 進捗 | on progress |
| `connection.takenOver` | 別タブに接続を奪われた | 1 回 |

## 7. Data Model Extensions

既存の `song.ts` 型に以下を追加する (全て optional、後方互換):

```typescript
// New types
export interface PluginRef {
  format: 'vst3' | 'clap' | 'builtin';
  uid: string;        // URI or plugin path
  name: string;
  vendor?: string;
}

export interface ChainNode {
  id: string;
  kind: 'instrument' | 'insert' | 'bus';
  plugin: PluginRef;
  bypass: boolean;
  params: Record<string, number>;
  stateBlob?: string;   // base64 opaque plugin state
}

export interface Send {
  id: string;
  destBusId: string;
  level: number;
  pre: boolean;
}

export interface AutomationPoint {
  tick: number;
  value: number;
  curve?: 'linear' | 'hold' | 'bezier';
}

export interface Automation {
  nodeId: string;
  paramId: string;
  points: AutomationPoint[];
}

export interface Bus {
  id: string;
  name: string;
  chain: ChainNode[];
  sends: Send[];
  volume: number;
  pan: number;
}

export interface Master {
  chain: ChainNode[];
  volume: number;
}

// Track extensions (optional, backward compat)
interface Track {
  // ... existing fields ...
  chain?: ChainNode[];      // default []
  sends?: Send[];           // default []
  pan?: number;             // default 0
  automation?: Automation[]; // default []
}

// Song extensions (optional)
interface Song {
  // ... existing fields ...
  buses?: Bus[];
  master?: Master;
}
```

### Hydration on load

`song-serializer.ts` は load 時にこれらのフィールドがない古い song に対してデフォルト値を埋める。保存時は新フィールド込みで書く。古い client が新 song を読んでも不明なキーは無視される (非破壊)。

## 8. Authentication & Entitlement

Cadenza は Google OAuth + JWT (cookie) で認証している。Firebase Auth は**使っていない**。

### Ticket flow

Bridge は backend の cookie を見られないため、以下のリレー方式で entitlement を検証する:

```
① browser → backend: POST /api/bridge/ticket (cookie auth)
   ← { ticket: <short-lived JWT>, expiresAt: ... }

② browser → Bridge: send { cmd: "session.verify", ticket }

③ Bridge → backend: POST /api/bridge/verify-ticket { ticket }
   ← { valid: true, userId, tier: "premium", entitlements, expiresAt }

④ Bridge caches entitlement for 15 min per userId

⑤ Premium command (chain.addNode type=vst3) arrives → check cache → allow or reject
```

Ticket は短寿命 (10 分) の JWT で、Bridge には「このユーザーは Premium」を証明する手段だけを与える。Cookie は漏れない。

## 9. Phased Implementation

詳細はエピック Issue #68 と各 Phase Issue (#69-#78) を参照。

| Phase | Issue | ゴール | 期間 |
|---|---|---|---|
| P0 | #69 | Rust skeleton + WS + cpal sine + tray | 2 週間 |
| P1 | #70 | Protocol contract + Frontend engine abstraction | 1.5 週間 |
| P2 | #71 | CLAP host + project.load + transport | 2 週間 |
| P3 | #72 | Audio graph + render.wav | 2 週間 |
| P4 | #73 | Backend endpoints (ticket/verify/suggest) | 1 週間 |
| P5 | #74 | Mixer tab + NL Chat **(中間マイルストーン)** | 2 週間 |
| P6 | #75 | Automation tab + AI curve | 1.5 週間 |
| P7 | #76 | Plugin GUI fly-over + auto-start/watchdog/update | 2 週間 |
| P8 | #77 | VST3 C++ shim + entitlement **(技術的山場)** | 3 週間 |
| P9 | #78 | Distribution (sign/notarize/installer) | 1.5 週間 |

合計: 約 12-13 週間 (3 ヶ月)

## 10. UX — 「見えないインフラ」

Bridge の UX 目標は **Dropbox / Spotify Connect / Docker Desktop 並の透明性**である。

- 初回インストール後、ユーザーは Bridge の存在を意識しない
- 起動は OS ログイン時に自動
- メニューバー / トレイのみに常駐 (Dock/Taskbar に出ない、`LSUIElement=true`)
- browser を開くと 2 秒以内に自動接続
- クラッシュしても watchdog が 3 秒で復旧
- 更新は handshake.ack で通知、browser に小さいバッジ、1 クリックで適用
- ファイアウォール警告は出ない (127.0.0.1 のみ listen)
- 追加ダイアログ・権限要求は発生しない (audio output は権限不要)

残る不可避な摩擦:

- 初回インストール (1 回のみ、30 秒)
- mac 初回ゲートキーパー警告 (署名前の beta 期間のみ)
- 大量プラグインの初回スキャン (バックグラウンド)

## 11. Distribution

### mac

- Apple Silicon + Intel の universal binary (lipo)
- Developer ID Application で codesign
- `xcrun notarytool` で公証、`stapler staple` で添付
- `.app` → `.dmg` 配布
- SMAppService でログイン時起動を登録
- `Info.plist` に `LSUIElement=true`

### Windows

- x86_64-pc-windows-msvc
- Authenticode 署名 (signtool)
- WiX v4 で `.msi` インストーラ
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` で自動起動
- `tray-icon` crate で shell Notifyicon

### CI/CD

GitHub Actions `release.yml` がタグ push で mac + win 両方ビルド、署名、公証、GitHub Releases にアップロード。

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | VST3 SDK が GPL / proprietary dual license。静的リンクで GPL 伝染リスク | Phase 8 開始前に legal review。必要なら out-of-process 化 |
| 2 | プラグインクラッシュで Bridge 全体ダウン | Phase 1-8 は同プロセス受容、Rust panic は catch_unwind。将来 out-of-process |
| 3 | スリープ復帰で audio device lost | CoreAudio/WASAPI の device change 通知を購読、stream 再構築 |
| 4 | Plugin GUI fly-over の z-order バグ | 実機で Phase 7 検証、fallback は standalone floating window |
| 5 | 既存 Free 機能の破損 | non-regression Playwright suite を Phase 1 で確立、全 Phase 実行 |
| 6 | Bridge DRM 迂回 | 完璧な DRM は諦め、Bridge source を private、重要検証を backend 寄せ |
| 7 | false positive virus 検知 | Microsoft Defender false positive 報告、reputation 積み上げ |
| 8 | CI の audio loopback 不在 | Rust の render.wav offline test で代替、実機は手動 QA |

## 13. References

- GitHub Epic: #68
- Phase Issues: #69-#78
- Plan file: `.claude/plans/refactored-noodling-kahan.md`
- CLAUDE.md: 開発ルール (Agent Team 体制、non-regression 検査、deploy 前確認)
- CLAP spec: https://cleveraudio.org/
- VST3 SDK: https://github.com/steinbergmedia/vst3sdk
- clack-host: https://github.com/prokopyl/clack
- cpal: https://github.com/RustAudio/cpal

---

**この文書は各 Phase 完了時に更新される。**
