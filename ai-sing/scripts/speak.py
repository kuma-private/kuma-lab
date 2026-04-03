import argparse
import os
import numpy as np
import soundfile as sf
import mlx_whisper
from mlx_audio.tts.utils import load_model

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"

def transcribe_ref(audio_path):
    print(f"Transcribing reference audio: {audio_path}")
    result = mlx_whisper.transcribe(audio_path, language="ja")
    text = result["text"]
    print(f"Transcription: {text}")
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
    parser.add_argument("--output", help="Output WAV file path (single shot mode)")
    parser.add_argument("--output-dir", default="audio/speak", help="Output directory for interactive mode")
    parser.add_argument("--interactive", action="store_true", help="Interactive mode (model stays loaded)")
    parser.add_argument("--language", default="Japanese", help="Language (default: Japanese)")
    args = parser.parse_args()

    # Auto-transcribe reference audio if not provided
    ref_text = args.ref_text or transcribe_ref(args.target)

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
