let audioCtx: AudioContext | null = null;

// Only create AudioContext on user interaction
export function initAudio(): void {
	if (!audioCtx) {
		try {
			audioCtx = new AudioContext();
		} catch {
			// AudioContext not supported
		}
	}
	if (audioCtx && audioCtx.state === 'suspended') {
		audioCtx.resume().catch(() => {});
	}
}

async function playVoicevox(text: string): Promise<boolean> {
	if (!audioCtx) return false;

	try {
		if (audioCtx.state === 'suspended') {
			await audioCtx.resume();
		}

		const res = await fetch('/api/voice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ text })
		});

		if (!res.ok) return false;

		const arrayBuffer = await res.arrayBuffer();
		const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
		const source = audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(audioCtx.destination);
		source.start();
		return true;
	} catch {
		return false;
	}
}

function speakFallback(text: string): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
	window.speechSynthesis.cancel();
	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'ja-JP';
	u.rate = 0.7;
	u.pitch = 1.8;
	u.volume = 1;
	window.speechSynthesis.speak(u);
}

export async function speak(text: string): Promise<void> {
	const success = await playVoicevox(text);
	if (!success) {
		speakFallback(text);
	}
}
