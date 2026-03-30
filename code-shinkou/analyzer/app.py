import tempfile
import os

import librosa
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI()

PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Chord templates
CHORD_TEMPLATES = {}
for i, name in enumerate(PITCH_NAMES):
    major = np.zeros(12)
    major[i] = 1.0
    major[(i + 4) % 12] = 0.7
    major[(i + 7) % 12] = 0.7
    CHORD_TEMPLATES[name] = major

    minor = np.zeros(12)
    minor[i] = 1.0
    minor[(i + 3) % 12] = 0.7
    minor[(i + 7) % 12] = 0.7
    CHORD_TEMPLATES[f"{name}m"] = minor


def detect_key(chroma: np.ndarray) -> dict:
    mean_chroma = np.mean(chroma, axis=1)

    results = []
    for i in range(12):
        rotated = np.roll(mean_chroma, -i)
        corr_major = np.corrcoef(rotated, MAJOR_PROFILE)[0, 1]
        corr_minor = np.corrcoef(rotated, MINOR_PROFILE)[0, 1]
        results.append((corr_major, PITCH_NAMES[i], "major"))
        results.append((corr_minor, PITCH_NAMES[i], "minor"))

    results.sort(key=lambda x: x[0], reverse=True)
    top_corr, top_root, top_mode = results[0]
    second_corr, second_root, second_mode = results[1]

    # Prefer major when close (pop music bias)
    if top_mode == "minor" and second_mode == "major":
        if top_corr - second_corr < 0.05:
            return {"root": second_root, "mode": "major"}

    return {"root": top_root, "mode": top_mode}


def detect_chord(chroma_segment: np.ndarray) -> str:
    mean_chroma = np.mean(chroma_segment, axis=1)
    if np.max(mean_chroma) < 0.01:
        return "N"

    mean_chroma = mean_chroma / (np.linalg.norm(mean_chroma) + 1e-10)

    best_chord = "N"
    best_score = -1.0

    for chord_name, template in CHORD_TEMPLATES.items():
        template_norm = template / (np.linalg.norm(template) + 1e-10)
        score = np.dot(mean_chroma, template_norm)
        if score > best_score:
            best_score = score
            best_chord = chord_name

    return best_chord


def chord_to_degree(chord: str, key_root: str, key_mode: str) -> str:
    if chord == "N":
        return "N"

    is_minor_chord = chord.endswith("m")
    chord_root = chord.rstrip("m")

    if chord_root not in PITCH_NAMES:
        return "?"

    root_idx = PITCH_NAMES.index(key_root)
    chord_idx = PITCH_NAMES.index(chord_root)
    interval = (chord_idx - root_idx) % 12

    if key_mode == "major":
        degree_map = {
            0: "I", 2: "II", 4: "III", 5: "IV", 7: "V", 9: "VI", 11: "VII",
            1: "bII", 3: "bIII", 6: "#IV", 8: "bVI", 10: "bVII",
        }
    else:
        degree_map = {
            0: "I", 2: "II", 3: "III", 5: "IV", 7: "V", 8: "VI", 10: "VII",
            1: "bII", 4: "#III", 6: "#IV", 9: "#VI", 11: "#VII",
        }

    roman = degree_map.get(interval, "?")
    if is_minor_chord:
        roman = roman.lower()

    return roman


@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        y, sr = librosa.load(tmp_path, sr=22050)

        # Separate harmonic content (remove percussion noise)
        y_harmonic = librosa.effects.harmonic(y, margin=4.0)

        # Use CENS chroma (more stable, normalized)
        chroma = librosa.feature.chroma_cens(y=y_harmonic, sr=sr)

        key_info = detect_key(chroma)

        # Beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        if len(beat_times) < 2:
            duration = librosa.get_duration(y=y, sr=sr)
            beat_times = np.arange(0, duration, 0.5)
            beat_frames = librosa.time_to_frames(beat_times, sr=sr)

        # Analyze per bar (4 beats)
        bar_step = 4
        raw_chords = []
        i = 0
        while i < len(beat_times):
            end_idx = min(i + bar_step, len(beat_frames))
            start_frame = beat_frames[i]
            end_frame = beat_frames[end_idx] if end_idx < len(beat_frames) else chroma.shape[1]

            if start_frame >= end_frame:
                i += bar_step
                continue

            segment = chroma[:, start_frame:end_frame]
            chord_name = detect_chord(segment)

            if chord_name == "N":
                i += bar_step
                continue

            start_time = float(beat_times[i])
            end_time = float(beat_times[end_idx]) if end_idx < len(beat_times) else float(librosa.get_duration(y=y, sr=sr))

            raw_chords.append({
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "chord": chord_name,
            })

            i += bar_step

        # Merge consecutive same chords
        merged = []
        for c in raw_chords:
            if merged and c["chord"] == merged[-1]["chord"]:
                merged[-1]["end"] = c["end"]
            else:
                merged.append(c.copy())

        # Add degree info
        for c in merged:
            c["degree"] = chord_to_degree(c["chord"], key_info["root"], key_info["mode"])

        os.unlink(tmp_path)

        return JSONResponse({
            "key": key_info,
            "chords": merged,
        })

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/health")
async def health():
    return {"status": "ok"}
