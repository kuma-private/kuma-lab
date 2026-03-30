type RecognitionCallback = (text: string) => void;

let recognition: SpeechRecognition | null = null;

export function isSupported(): boolean {
	return typeof window !== 'undefined' &&
		('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export function startListening(onResult: RecognitionCallback, onEnd?: () => void): void {
	if (!isSupported()) return;

	stop();

	const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
	recognition = new SpeechRecognition();
	recognition.lang = 'ja-JP';
	recognition.interimResults = false;
	recognition.maxAlternatives = 3;

	recognition.onresult = (event: SpeechRecognitionEvent) => {
		for (let i = 0; i < event.results.length; i++) {
			for (let j = 0; j < event.results[i].length; j++) {
				const text = event.results[i][j].transcript;
				if (text) onResult(text);
			}
		}
	};

	recognition.onend = () => {
		onEnd?.();
	};

	recognition.onerror = () => {
		onEnd?.();
	};

	recognition.start();
}

export function stop(): void {
	if (recognition) {
		try { recognition.stop(); } catch { /* ignore */ }
		recognition = null;
	}
}
