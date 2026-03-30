let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioCtx) {
		audioCtx = new AudioContext();
	}
	return audioCtx;
}

// Must be called from a user interaction event (tap/click) to enable audio on mobile
export function initAudio(): void {
	const ctx = getAudioContext();
	if (ctx.state === 'suspended') {
		ctx.resume();
	}
}

async function playVoicevox(text: string): Promise<boolean> {
	try {
		const ctx = getAudioContext();
		// Resume on every play attempt for mobile safety
		if (ctx.state === 'suspended') {
			await ctx.resume();
		}

		const res = await fetch('/api/voice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ text })
		});

		if (!res.ok) return false;

		const arrayBuffer = await res.arrayBuffer();
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
	const success = await playVoicevox(text);
	if (!success) {
		speakFallback(text);
	}
}
