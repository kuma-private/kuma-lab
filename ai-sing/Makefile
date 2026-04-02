AUDIO_DIR := audio
VENV := seed-vc/.venv/bin
TTS_VENV := .venv-tts/bin
DIFFUSION_STEPS ?= 30
SEMI_TONE_SHIFT ?= 0
VOCAL_VOLUME ?= 2.5

# YouTube音声取得
# 使い方:
#   make clip URL=https://... FROM=00:03:57 TO=00:04:17 NAME=my_clip  (時間指定)
#   make clip URL=https://... NAME=full_song                           (全体)
clip:
	@mkdir -p $(AUDIO_DIR)
ifdef FROM
	yt-dlp -x --audio-format wav -o "$(AUDIO_DIR)/_full_tmp.%(ext)s" "$(URL)"
	ffmpeg -i $(AUDIO_DIR)/_full_tmp.wav -ss $(FROM) -to $(TO) $(AUDIO_DIR)/$(NAME).wav -y
	rm -f $(AUDIO_DIR)/_full_tmp.wav
else
	yt-dlp -x --audio-format wav -o "$(AUDIO_DIR)/$(NAME).%(ext)s" "$(URL)"
endif
	@echo "=> $(AUDIO_DIR)/$(NAME).wav"

# ボーカル分離 (Demucs)
# 使い方: make separate SOURCE=audio/song.wav
separate:
	$(VENV)/python -m demucs --two-stems=vocals -o $(AUDIO_DIR)/separated "$(SOURCE)"
	@echo "=> $(AUDIO_DIR)/separated/htdemucs/$$(basename $(SOURCE) .wav)/"

# Seed-VC 歌声変換
# 使い方: make convert SOURCE=audio/song.wav TARGET=audio/my_voice.wav
convert:
	@mkdir -p $(AUDIO_DIR)/output
	cd seed-vc && $(abspath $(VENV))/python inference.py \
		--source ../$(SOURCE) \
		--target ../$(TARGET) \
		--output ../$(AUDIO_DIR)/output \
		--diffusion-steps $(DIFFUSION_STEPS) \
		--f0-condition True \
		--semi-tone-shift $(SEMI_TONE_SHIFT)
	@echo "=> $(AUDIO_DIR)/output/"

# ボーカル + 伴奏を合成
# 使い方: make mix VOCALS=audio/output/converted.wav INST=audio/separated/htdemucs/song/no_vocals.wav NAME=final
mix:
	@mkdir -p $(AUDIO_DIR)/final
	ffmpeg -i "$(VOCALS)" -i "$(INST)" -filter_complex "[0:a]volume=$(VOCAL_VOLUME)[v];[1:a]apad[i];[v][i]amix=inputs=2:duration=longest:weights=1 1:normalize=0[out]" -map "[out]" "$(AUDIO_DIR)/final/$(NAME).wav" -y
	@echo "=> $(AUDIO_DIR)/final/$(NAME).wav"

# 全自動パイプライン: 分離 → 変換 → 合成
# 使い方: make sing SOURCE=audio/song.wav TARGET=audio/my_voice.wav NAME=result
sing: _sing_separate _sing_convert _sing_mix
	@echo "=> $(AUDIO_DIR)/final/$(NAME).wav"

_STEM_DIR = $(AUDIO_DIR)/separated/htdemucs/$(basename $(notdir $(SOURCE)))

_sing_separate:
	@echo ""
	@echo "========== [1/3] ボーカル分離 (Demucs) =========="
	@echo ""
	$(VENV)/python -m demucs --two-stems=vocals -o $(AUDIO_DIR)/separated "$(SOURCE)"

_sing_convert:
	@echo ""
	@echo "========== [2/3] 歌声変換 (Seed-VC) =========="
	@echo ""
	@mkdir -p $(AUDIO_DIR)/output
	cd seed-vc && $(abspath $(VENV))/python inference.py \
		--source ../$(_STEM_DIR)/vocals.wav \
		--target ../$(TARGET) \
		--output ../$(AUDIO_DIR)/output \
		--diffusion-steps $(DIFFUSION_STEPS) \
		--f0-condition True \
		--semi-tone-shift $(SEMI_TONE_SHIFT)

_sing_mix:
	@echo ""
	@echo "========== [3/3] ミックス =========="
	@echo ""
	@mkdir -p $(AUDIO_DIR)/final
	$(eval VC_FILE := $(shell ls -t $(AUDIO_DIR)/output/vc_vocals_* 2>/dev/null | head -1))
	ffmpeg -i "$(VC_FILE)" -i "$(_STEM_DIR)/no_vocals.wav" -filter_complex amix=inputs=2:duration=longest "$(AUDIO_DIR)/final/$(NAME).wav" -y

# ゼロショットTTS（テキスト読み上げ）
# 使い方:
#   make speak TEXT="こんにちは" TARGET=audio/source_clip.wav NAME=greeting  (単発)
#   make speak-i TARGET=audio/source_clip.wav                               (対話モード)
speak:
	@mkdir -p $(AUDIO_DIR)/speak
	$(TTS_VENV)/python speak.py \
		--text "$(TEXT)" \
		--target "$(TARGET)" \
		--output "$(AUDIO_DIR)/speak/$(NAME).wav"

speak-i:
	@mkdir -p $(AUDIO_DIR)/speak
	$(TTS_VENV)/python speak.py \
		--interactive \
		--target "$(TARGET)" \
		--output-dir "$(AUDIO_DIR)/speak"

# Seed-VC Web UI起動
ui:
	cd seed-vc && $(abspath $(VENV))/python app_svc.py

.PHONY: clip separate convert mix sing speak speak-i ui _sing_separate _sing_convert _sing_mix
