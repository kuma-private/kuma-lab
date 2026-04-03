INPUT_DIR := input
OUTPUT_DIR := output
TMP_DIR := tmp
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
	@mkdir -p $(INPUT_DIR)/song
ifdef FROM
	yt-dlp -x --audio-format wav -o "$(TMP_DIR)/_full_tmp.%(ext)s" "$(URL)"
	ffmpeg -i $(TMP_DIR)/_full_tmp.wav -ss $(FROM) -to $(TO) $(INPUT_DIR)/song/$(NAME).wav -y
	rm -f $(TMP_DIR)/_full_tmp.wav
else
	yt-dlp -x --audio-format wav -o "$(INPUT_DIR)/song/$(NAME).%(ext)s" "$(URL)"
endif
	@echo "=> $(INPUT_DIR)/song/$(NAME).wav"

# ボーカル分離 (Demucs)
# 使い方: make separate SOURCE=input/song/song.wav
separate:
	@mkdir -p $(TMP_DIR)/separated
	$(VENV)/python -m demucs --two-stems=vocals -o $(TMP_DIR)/separated "$(SOURCE)"
	@echo "=> $(TMP_DIR)/separated/htdemucs/$$(basename $(SOURCE) .wav)/"

# Seed-VC 歌声変換
# 使い方: make convert SOURCE=tmp/separated/.../vocals.wav TARGET=input/source/my_voice.wav
convert:
	@mkdir -p $(TMP_DIR)/converted
	cd seed-vc && $(abspath $(VENV))/python inference.py \
		--source ../$(SOURCE) \
		--target ../$(TARGET) \
		--output ../$(TMP_DIR)/converted \
		--diffusion-steps $(DIFFUSION_STEPS) \
		--f0-condition True \
		--semi-tone-shift $(SEMI_TONE_SHIFT)
	@echo "=> $(TMP_DIR)/converted/"

# ボーカル + 伴奏を合成
# 使い方: make mix VOCALS=tmp/converted/... INST=tmp/separated/.../no_vocals.wav NAME=final
mix:
	@mkdir -p $(OUTPUT_DIR)/sing
	ffmpeg -i "$(VOCALS)" -i "$(INST)" -filter_complex "[0:a]volume=$(VOCAL_VOLUME)[v];[1:a]apad[i];[v][i]amix=inputs=2:duration=longest:weights=1 1:normalize=0[out]" -map "[out]" "$(OUTPUT_DIR)/sing/$(NAME).wav" -y
	@echo "=> $(OUTPUT_DIR)/sing/$(NAME).wav"

# 全自動パイプライン: 分離 → 変換 → 合成
# 使い方: make sing SOURCE=input/song/song.wav TARGET=input/source/my_voice.wav NAME=result
sing: _sing_separate _sing_convert _sing_mix
	@echo "=> $(OUTPUT_DIR)/sing/$(NAME).wav"

_STEM_DIR = $(TMP_DIR)/separated/htdemucs/$(basename $(notdir $(SOURCE)))

_sing_separate:
	@echo ""
	@echo "========== [1/3] ボーカル分離 (Demucs) =========="
	@echo ""
	@mkdir -p $(TMP_DIR)/separated
	$(VENV)/python -m demucs --two-stems=vocals -o $(TMP_DIR)/separated "$(SOURCE)"

_sing_convert:
	@echo ""
	@echo "========== [2/3] 歌声変換 (Seed-VC) =========="
	@echo ""
	@mkdir -p $(TMP_DIR)/converted
	cd seed-vc && $(abspath $(VENV))/python inference.py \
		--source ../$(_STEM_DIR)/vocals.wav \
		--target ../$(TARGET) \
		--output ../$(TMP_DIR)/converted \
		--diffusion-steps $(DIFFUSION_STEPS) \
		--f0-condition True \
		--semi-tone-shift $(SEMI_TONE_SHIFT)

_sing_mix:
	@echo ""
	@echo "========== [3/3] ミックス =========="
	@echo ""
	@mkdir -p $(OUTPUT_DIR)/sing
	$(eval VC_FILE := $(shell ls -t $(TMP_DIR)/converted/vc_vocals_* 2>/dev/null | head -1))
	ffmpeg -i "$(VC_FILE)" -i "$(_STEM_DIR)/no_vocals.wav" -filter_complex "[0:a]volume=$(VOCAL_VOLUME)[v];[1:a]apad[i];[v][i]amix=inputs=2:duration=longest:weights=1 1:normalize=0[out]" -map "[out]" "$(OUTPUT_DIR)/sing/$(NAME).wav" -y

# ゼロショットTTS（テキスト読み上げ）
# 使い方:
#   make speak TEXT="こんにちは" TARGET=input/source/my_voice.wav NAME=greeting  (単発)
#   make speak-i TARGET=input/source/my_voice.wav                               (対話モード)
speak:
	@mkdir -p $(OUTPUT_DIR)/speak
	$(TTS_VENV)/python scripts/speak.py \
		--text "$(TEXT)" \
		--target "$(TARGET)" \
		--output "$(OUTPUT_DIR)/speak/$(NAME).wav"

speak-i:
	@mkdir -p $(OUTPUT_DIR)/speak
	$(TTS_VENV)/python scripts/speak.py \
		--interactive \
		--target "$(TARGET)" \
		--output-dir "$(OUTPUT_DIR)/speak"

# Seed-VC Web UI起動
ui:
	cd seed-vc && $(abspath $(VENV))/python app_svc.py

# 中間ファイル削除
clean:
	rm -rf $(TMP_DIR)/*

.PHONY: clip separate convert mix sing speak speak-i ui clean _sing_separate _sing_convert _sing_mix
