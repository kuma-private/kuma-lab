# ai-sing

参考音声（20秒程度）を使った歌声変換とゼロショット音声合成のローカルツールキット。
Apple Silicon Mac (MPS) でネイティブ動作。

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
# 全体
make clip URL="https://www.youtube.com/watch?v=xxx" NAME=song

# 時間指定
make clip URL="https://..." FROM=00:03:57 TO=00:04:17 NAME=clip
```

### 歌声変換（全自動: 分離 → 変換 → 合成）

```bash
make sing SOURCE=audio/song.wav TARGET=audio/my_voice.wav NAME=result
```

### 音声合成（ゼロショットTTS）

```bash
# 単発
make speak TEXT="こんにちは" TARGET=audio/my_voice.wav NAME=hello

# 対話モード（モデル常駐）
make speak-i TARGET=audio/my_voice.wav
```

### 個別ステップ

```bash
make separate SOURCE=audio/song.wav                    # ボーカル分離
make convert SOURCE=audio/vocals.wav TARGET=audio/my_voice.wav  # 声変換
make mix VOCALS=... INST=... NAME=final                # ミックス
make ui                                                 # Web UI起動
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
