# ai-sing

参考音声（20秒程度）を使った歌声変換とゼロショット音声合成のローカルツールキット。
Apple Silicon Mac (MPS) でネイティブ動作。

## ディレクトリ構成

```
ai-sing/
├── Makefile          # CLI エントリポイント
├── speak.py          # Qwen3-TTS ゼロショットTTS
├── seed-vc/          # Seed-VC (git clone)
├── .venv-tts/        # TTS用 Python venv
└── audio/
    ├── source/       # 参考音声（自分の声）
    ├── song/         # 変換元の楽曲
    ├── separated/    # Demucs分離結果（vocals / no_vocals）
    ├── output/       # Seed-VC変換結果
    ├── final/        # ミックス済み最終出力
    └── speak/        # TTS出力
```

## パイプライン

```
source（参考音声）
  ├─→ sing:  song → [分離] → [声変換] → [ミックス] → final/
  └─→ speak: テキスト → [TTS] → speak/
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
make clip URL="https://..." NAME=song              # 全体
make clip URL="https://..." FROM=00:01:00 TO=00:04:00 NAME=clip  # 時間指定
```

### 歌声変換（全自動）

```bash
make sing SOURCE=audio/song/song.wav TARGET=audio/source/my_voice.wav NAME=result
```

### 音声合成（ゼロショットTTS）

```bash
make speak TEXT="こんにちは" TARGET=audio/source/my_voice.wav NAME=hello
make speak-i TARGET=audio/source/my_voice.wav   # 対話モード（モデル常駐）
```

### 個別ステップ

```bash
make separate SOURCE=audio/song/song.wav
make convert SOURCE=audio/vocals.wav TARGET=audio/source/my_voice.wav
make mix VOCALS=... INST=... NAME=final
make ui                                          # Seed-VC Web UI
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
