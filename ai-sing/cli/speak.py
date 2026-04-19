import argparse
import os
# All required models are expected to be cached locally. Going offline avoids
# a HuggingFace Hub "check for updates" network call that can hang on slow
# IPv6 connects (observed: sock_connect → SYN_SENT for minutes).
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"


def _cache_stamp(audio_path):
    st = os.stat(audio_path)
    return f"{int(st.st_mtime)}:{st.st_size}"


def load_ref_text(audio_path, cache_path):
    if cache_path and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                stamp = f.readline().strip()
                text = f.read()
            if stamp == _cache_stamp(audio_path) and text:
                print(f"ref_text cache hit: {cache_path}")
                return text.strip()
        except Exception as e:
            print(f"ref_text cache read failed: {e}")

    # Import lazily so an offline-cached cache hit avoids loading whisper at all.
    import mlx_whisper
    print(f"Transcribing reference audio: {audio_path}")
    result = mlx_whisper.transcribe(audio_path, language="ja")
    text = result["text"].strip()
    print(f"Transcription: {text}")

    if cache_path:
        try:
            os.makedirs(os.path.dirname(cache_path) or ".", exist_ok=True)
            with open(cache_path, "w", encoding="utf-8") as f:
                f.write(f"{_cache_stamp(audio_path)}\n{text}")
            print(f"ref_text cached: {cache_path}")
        except Exception as e:
            print(f"ref_text cache write failed: {e}")
    return text


def generate_speech(model, text, target, ref_text, output_path, language="Japanese"):
    results = list(model.generate(
        text=text,
        language=language,
        ref_audio=target,
        ref_text=ref_text,
    ))
    all_audio = []
    sr = 24000
    for r in results:
        all_audio.append(np.array(r.audio))
        sr = r.sample_rate
    if not all_audio:
        print("Warning: no audio generated")
        return
    audio = np.concatenate(all_audio)
    sf.write(output_path, audio, samplerate=sr)
    duration = len(audio) / sr
    print(f"=> {output_path} ({duration:.1f}s)")

def main():
    parser = argparse.ArgumentParser(description="Zero-shot TTS with voice cloning (Qwen3-TTS)")
    parser.add_argument("--text", help="Text to speak (single shot mode)")
    parser.add_argument("--target", required=True, help="Reference audio file")
    parser.add_argument("--ref-text", help="Transcription of reference audio (auto-transcribed if omitted)")
    parser.add_argument("--ref-text-cache", help="Path to cache the transcription (skips whisper on subsequent runs)")
    parser.add_argument("--output", help="Output WAV file path (single shot mode)")
    parser.add_argument("--output-dir", default="audio/speak", help="Output directory for interactive mode")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode (model stays loaded)")
    parser.add_argument("--language", default="Japanese", help="Language (default: Japanese)")
    args = parser.parse_args()

    if args.ref_text:
        ref_text = args.ref_text
    else:
        ref_text = load_ref_text(args.target, args.ref_text_cache)

    print("Loading TTS model...")
    model = load_model(MODEL_ID)
    print("Model loaded.")

    if args.interactive:
        os.makedirs(args.output_dir, exist_ok=True)
        print(f"\nInteractive mode. Output dir: {args.output_dir}")
        print("Format: <filename> <text>")
        print("Type 'quit' to exit.\n")
        while True:
            try:
                line = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not line or line == "quit":
                break
            parts = line.split(" ", 1)
            if len(parts) < 2:
                print("Format: <filename> <text>")
                continue
            name, text = parts
            if not name.endswith(".wav"):
                name += ".wav"
            output_path = os.path.join(args.output_dir, name)
            print(f"Generating: {text}")
            generate_speech(model, text, args.target, ref_text, output_path, args.language)
    else:
        if not args.text or not args.output:
            parser.error("--text and --output are required in single shot mode")
        generate_speech(model, args.text, args.target, ref_text, args.output, args.language)

if __name__ == "__main__":
    main()
