type RecognitionCallback = (text: string, isFinal: boolean) => void;

let recognition: SpeechRecognition | null = null;

export function isSupported(): boolean {
	return typeof window !== 'undefined' &&
		('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export function startListening(onResult: RecognitionCallback, onEnd?: () => void): void {
	stop();

	const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
	recognition = new SpeechRecognition();
	recognition.lang = 'ja-JP';
	recognition.interimResults = true;  // Enable real-time results
	recognition.continuous = true;
	recognition.maxAlternatives = 1;

	recognition.onresult = (event: SpeechRecognitionEvent) => {
		let interim = '';
		let final = '';

		for (let i = event.resultIndex; i < event.results.length; i++) {
			const transcript = event.results[i][0].transcript;
			if (event.results[i].isFinal) {
				final += transcript;
			} else {
				interim += transcript;
			}
		}

		if (final) {
			onResult(final, true);
		} else if (interim) {
			onResult(interim, false);
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
