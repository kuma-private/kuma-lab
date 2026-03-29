let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx) {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

async function playVoicevox(text: string): Promise<boolean> {
	try {
		const res = await fetch('/api/voice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ text })
		});

		if (!res.ok) return false;

		const arrayBuffer = await res.arrayBuffer();
		const ctx = getAudioContext();
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(ctx.destination);
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
	// Try VOICEVOX first, fallback to Web Speech API
	const success = await playVoicevox(text);
	if (!success) {
		speakFallback(text);
	}
}
