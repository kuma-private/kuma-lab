# ai-sing

参考音声（20秒程度）を使った歌声変換とゼロショット音声合成のローカルツールキット。
Apple Silicon Mac (MPS) でネイティブ動作。

## ディレクトリ構成

```
ai-sing/
├── Makefile
├── scripts/
│   ├── speak.py       # Qwen3-TTS ゼロショットTTS
│   └── sing.py        # (予定) 歌声変換パイプライン
├── input/
│   ├── source/        # 参考音声（自分の声）
│   └── song/          # 変換元の楽曲
├── output/
│   ├── sing/          # 歌声変換の最終出力
│   └── speak/         # TTS出力
├── tmp/               # 中間ファイル（分離結果、変換途中）
├── seed-vc/           # Seed-VC (git clone)
└── .venv-tts/         # TTS用 Python venv
```

## パイプライン

```
input/source/（参考音声）
  ├─→ sing:  input/song/ → [分離] → [声変換] → [ミックス] → output/sing/
  └─→ speak: テキスト → [TTS] → output/speak/
```

## セットアップ

### 前提

```bash
brew install python@3.10 yt-dlp ffmpeg
```

### Seed-VC（歌声変換）

```bash
git clone https://github.com/Plachtaa/seed-vc.git
cd seed-vc
python3.10 -m venv .venv
source .venv/bin/activate
pip install torch torchvision torchaudio
pip install -r requirements-mac.txt
pip install torchcodec demucs
```

### Qwen3-TTS（音声合成）

```bash
cd ai-sing
python3.10 -m venv .venv-tts
.venv-tts/bin/pip install mlx-audio mlx-whisper soundfile numpy
```

## 使い方

### YouTube音声取得

```bash
make clip URL="https://..." NAME=song                                  # 全体
make clip URL="https://..." FROM=00:01:00 TO=00:04:00 NAME=clip       # 時間指定
```

### 歌声変換（全自動）

```bash
make sing SOURCE=input/song/song.wav TARGET=input/source/my_voice.wav NAME=result
```

### 音声合成（ゼロショットTTS）

```bash
make speak TEXT="こんにちは" TARGET=input/source/my_voice.wav NAME=hello
make speak-i TARGET=input/source/my_voice.wav    # 対話モード（モデル常駐）
```

### その他

```bash
make separate SOURCE=input/song/song.wav         # ボーカル分離のみ
make ui                                           # Seed-VC Web UI
make clean                                        # 中間ファイル削除
```

## オプション

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `VOCAL_VOLUME` | 2.5 | ミックス時のボーカル音量 |
| `DIFFUSION_STEPS` | 30 | 品質（高いほど高品質で遅い） |
| `SEMI_TONE_SHIFT` | 0 | ピッチシフト（半音単位） |

## 技術スタック

- **Seed-VC** — ゼロショット歌声変換（Diffusion Transformer, MPS対応）
- **Demucs** (Meta) — ボーカル分離
- **Qwen3-TTS** (Alibaba) — ゼロショット日本語TTS（MLXネイティブ）
- **mlx-whisper** — 参考音声の自動書き起こし
- **yt-dlp** + **ffmpeg** — 音声取得・加工
