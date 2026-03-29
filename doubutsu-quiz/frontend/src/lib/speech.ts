export function speak(text: string): void {
	if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
		return;
	}

	window.speechSynthesis.cancel();

	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'ja-JP';
	u.rate = 0.7;
	u.pitch = 1.8;
	u.volume = 1;

	window.speechSynthesis.speak(u);
}
