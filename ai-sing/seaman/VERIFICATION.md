# Seaman 動作検証手順

Seaman は macOS SwiftUI デスクトップアプリのため、ユニットテスト・smoke
test に加えて最終的に目視確認が必要。本ドキュメントは 8 セクション構成。

## 1. 事前条件

- macOS 14.0+
- **Xcode.app** — `swift test` に必須（CommandLineTools のみだと XCTest
  が存在せず失敗する）
- `ai-sing/.venv-tts/` に TTS 仮想環境（`uv venv .venv-tts --python 3.11`）
- `ai-sing/seed-vc/.venv/` に Seed-VC 仮想環境（歌機能を使う場合）
- `ai-sing/input/source/source_clip.wav` に参考音声
- `ollama serve &` 起動済み、`qwen3.5:122b` または設定で指定したモデルが
  `ollama pull` 済み

## 2. 自動テスト

```bash
cd ai-sing
make seaman-ci
```

期待出力:
- `seaman-build`: `Build complete!` (警告ゼロ)
- `seaman-test`: XCTest suite 緑。`SKIP` を含むテストあり（Agent-3 未完了時）
- `seaman-smoke`: `OK: /tmp/.../smoke.wav (N bytes)`

個別実行:
- `make seaman-build` — コンパイル + 警告ゼロ
- `make seaman-test` — XCTest（要 Xcode）
- `make seaman-smoke` — speak.py 単体の 1 発話ラウンドトリップ

## 3. 起動 smoke（目視）

```bash
cd ai-sing
make seaman-app
open seaman/dist/Seaman.app
```

期待挙動:
- 20 秒以内にメニューバーに 🐟 アイコン出現
- 画面中央あたりにシーマン窓（透明背景 + 魚絵）
- **起動直後〜モデルロード完了まで** 魚の上に `🐟 起動中…` の吹き出しが出る（#90 対応、TTS の MLX Qwen3-TTS ロード中のみ表示）
- 「起動中」表示が消えた後、60 秒以内に最初の発話が表示 + 音声再生
- 吹き出しは 8 秒で自動消去

失敗パターン:
- 🐟 絵文字表示 = 画像ファイルが読めていない（#91、Bundle.main ロードで解消済）
- 「起動中…」が何分経っても消えない = speak.py が起動失敗 or refAudio 不在（ログ `tmp/seaman.log` 参照）
- 吹き出しのみ出て音声が出ない = refAudio or .venv-tts 不在（§8 参照）

## 4. 2 体モード（Issue #94）

1. メニューバー 🐟 → 「設定...」
2. 「Seaman B」タブ → 「2体モードを有効化」トグルを ON
3. Pet B 窓が画面右（Pet A から 340px オフセット）に出現
4. Seaman B の refAudio を別 WAV に変更して保存
5. しばらく放置、または「今すぐ喋らせる」ボタンを A 側で押す
6. A が喋ったあと 3〜7 秒で B が「相手」履歴を受けてリアクション発言

失敗パターン:
- トグル ON してもウィンドウ出ない = BorderlessKeyWindow 未適用
  （Agent-4 E5 で修正済、この手順書更新後の状態で検証）
- B が画面外に出る = visibleFrame クランプ未適用（同上）

## 5. 歌機能（Issue #93）

1. メニューバー 🐟 → 「🎤 歌わせる...」
2. 「歌ファイル (WAV)」 = 歌の元素材を選択（`ai-sing/input/song/*.wav`）
3. 「参考音声」 = 声質ターゲットの WAV
4. 出力ファイル名、半音シフト設定後「歌わせる」
5. 進捗: 「ボーカル分離中... (1/3)」→「声質変換中... (2/3)」→
   「ミックス中... (3/3)」→「完了」
6. 出力: `ai-sing/output/sing/<name>.wav` → 「Finderで開く」で reveal
7. 「再生」ボタンで afplay 再生

失敗パターン:
- 「ボーカル分離中...」で長時間停止 = Demucs 初回モデル DL（初回 5-10分）
- 「声質変換中...」で異常終了 = seed-vc/.venv 不在 or CUDA/MPS 互換問題

## 6. 設定 UI（Issue #92）

1. プリセットドロップダウン切替 → 「トピック / 性格」欄が即変わる
2. 間隔スライダー: 0.5 分刻みで 0.5 〜 30 分
3. 「今すぐ喋らせる」押下 → 即 generate + TTS（in flight 中は二重発火しない）
4. プリセット変更後に自動保存、次回起動で復元
5. **LLM (Ollama)** セクション — モデル名と API URL をテキストで編集可能。変更は
   次の発話から反映（`qwen3.5:122b` → `llama3.1:8b` 等へ切替、リモート Ollama
   に向けるなど）

失敗パターン:
- スライダー変更が次のタイマー発火まで反映されない =
  `.seamanIntervalChanged` 通知未接続（現状は PetViewModel.start で observer 付け済）
- LLM モデル名を間違えると全発話が `…水槽の中は今日も退屈だ` にフォールバック →
  `ollama list` で正しいタグを確認

## 7. セットアップ診断

1. メニューバー 🐟 → 「🛠 セットアップ診断...」
2. 6 項目すべて ✅ になっているか確認:
   - ai-sing プロジェクトパス
   - TTS 仮想環境
   - Seed-VC 仮想環境
   - 参考音声
   - ffmpeg
   - Ollama
3. ❌ 項目は「fix hint」欄に Terminal コマンドが表示 → 「コピー」で clipboard

## 8. 既知の失敗パターン

| 症状 | 原因 | 対処 |
|---|---|---|
| 吹き出しのみで音声ゼロ | refAudio 未設定 / .venv-tts 不在 | 設定 or セットアップ診断で修正 |
| 初回発話まで 20秒 | MLX モデルロード（正常、#90 で「起動中…」表示あり） | `make seaman-smoke` で warmup 済にしてから起動 |
| 🐟 絵文字フォールバック | Resources/*.png 不在 | `make seaman-app` で .app 再ビルド |
| 2 体モード起動せず | BorderlessKeyWindow 未適用 | 最新ビルド使用確認 |
| LLM 応答なし | Ollama 停止 or モデル未 DL | `ollama serve && ollama pull qwen3.5:122b` |
