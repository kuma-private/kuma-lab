let audioCtx: AudioContext | null = null;
let audioInitialized = false;

// Pre-loaded audio cache: text -> ArrayBuffer
const audioCache = new Map<string, ArrayBuffer>();
let preloading = false;

export function initAudio(): void {
	if (audioInitialized) return;
	try {
		audioCtx = new AudioContext();
		audioInitialized = true;
	} catch {
		// AudioContext not available
	}
}

// Warmup: send a tiny request to wake up VOICEVOX Cloud Run
export async function warmup(): Promise<void> {
	try {
		await fetch('/api/voice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ text: 'あ' })
		});
	} catch {
		// ignore
	}
}

async function fetchVoice(text: string): Promise<void> {
	try {
		const res = await fetch('/api/voice', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ text })
		});
		if (res.ok) {
			const buf = await res.arrayBuffer();
			audioCache.set(text, buf);
		}
	} catch {
		// skip
	}
}

// Pre-load voices: first 2 items immediately, rest in pairs
export async function preloadVoices(texts: string[]): Promise<void> {
	preloading = true;

	// Load in pairs of 2, preserving order so early questions are ready first
	for (let i = 0; i < texts.length; i += 2) {
		const batch = texts.slice(i, i + 2);
		await Promise.allSettled(batch.map(fetchVoice));
	}

	preloading = false;
}

export function clearCache(): void {
	audioCache.clear();
}

async function playFromCache(text: string): Promise<boolean> {
	if (!audioCtx) return false;

	const buf = audioCache.get(text);
	if (!buf) return false;

	try {
		if (audioCtx.state === 'suspended') {
			await audioCtx.resume();
		}
		// Clone buffer since decodeAudioData detaches it
		const clone = buf.slice(0);
		const audioBuffer = await audioCtx.decodeAudioData(clone);
		const source = audioCtx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(audioCtx.destination);
		source.start();
		return true;
	} catch {
		return false;
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
	// Try pre-loaded cache first, then live VOICEVOX, then Web Speech fallback
	const cached = await playFromCache(text);
	if (cached) return;

	const live = await playVoicevox(text);
	if (live) return;

	speakFallback(text);
}
