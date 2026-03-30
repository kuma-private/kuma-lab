import type { Genre, QuizPhase, QuizItem, BlurStage } from '../types';
import { fetchQuizImages } from '../api';
import { preloadVoices, clearCache, warmup } from '../speech';

// Normalize: katakana→hiragana, remove spaces/symbols
function normalize(s: string): string {
	return s
		.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.replace(/[\s\u3000（）()「」、。！!？?・\-]/g, '')
		.toLowerCase();
}

class QuizState {
	phase: QuizPhase = $state('select');
	genre: Genre | null = $state(null);
	items: QuizItem[] = $state([]);
	currentIndex: number = $state(0);
	blurStage: BlurStage = $state(0);
	error: string = $state('');
	revealed: boolean = $state(false);
	loggedIn: boolean = $state(false);
	userName: string = $state('');

	// Quiz state
	wrongAnswer: boolean = $state(false);
	closeAnswer: boolean = $state(false);
	hintsUsed: number = $state(0);
	scores: number[] = $state([]);

	async checkLogin() {
		try {
			const res = await fetch('/auth/me', { credentials: 'include' });
			if (res.ok) {
				const data = await res.json();
				this.loggedIn = true;
				this.userName = data.name || '';
			}
		} catch {
			// not logged in
		}
	}

	async startQuiz(genre: Genre) {
		this.genre = genre;
		this.phase = 'loading';
		this.error = '';

		try {
			// Start VOICEVOX warmup AND quiz fetch in parallel
			clearCache();
			const warmupPromise = warmup();
			const itemsPromise = fetchQuizImages(genre);

			this.items = await itemsPromise;
			this._resetQuestion();
			this.scores = [];

			// Start preloading voices immediately (warmup should be done by now)
			const voiceTexts = this.items.map(i => `${i.name}! ${i.sound}`);
			preloadVoices(voiceTexts).catch(() => {});

			this.phase = 'quiz';
		} catch (e) {
			if (e instanceof Error && e.message === 'LOGIN_REQUIRED') {
				window.location.href = '/auth/google';
				return;
			}
			this.error = e instanceof Error ? e.message : 'エラーがおきました';
			this.phase = 'select';
		}
	}

	checkAnswer(input: string): boolean {
		const item = this.items[this.currentIndex];
		const answer = normalize(item.name);
		const guess = normalize(input);

		if (!guess || guess.length < 2) return false;

		// Exact match, or mutual substring
		if (answer === guess || answer.includes(guess) || guess.includes(answer)) {
			this.revealed = true;
			this.blurStage = 3;
			this.wrongAnswer = false;
			this.closeAnswer = false;
			this.scores.push(1);
			return true;
		}

		// Check if close (shares 50%+ characters)
		const shared = [...guess].filter(c => answer.includes(c)).length;
		const isClose = guess.length >= 2 && shared >= Math.ceil(answer.length * 0.4);

		this.closeAnswer = isClose;
		this.wrongAnswer = !isClose;
		setTimeout(() => { this.wrongAnswer = false; this.closeAnswer = false; }, 1200);
		return false;
	}

	useHint() {
		if (this.revealed) return;

		this.hintsUsed++;

		if (this.hintsUsed >= 3) {
			// Auto-reveal after 3 hints
			this.blurStage = 3;
			this.revealed = true;
			this.scores.push(0);
		} else {
			this.blurStage = Math.min(2, this.blurStage + 1) as BlurStage;
		}
	}

	nextQuestion() {
		if (this.currentIndex < this.items.length - 1) {
			this.currentIndex++;
			this._resetQuestion();
		} else {
			this.phase = 'complete';
		}
	}

	private _resetQuestion() {
		this.blurStage = 0;
		this.revealed = false;
		this.wrongAnswer = false;
		this.closeAnswer = false;
		this.hintsUsed = 0;
	}

	get totalScore(): number {
		return this.scores.reduce((a, b) => a + b, 0);
	}

	get maxScore(): number {
		return this.items.length;
	}

	reset() {
		this.phase = 'select';
		this.genre = null;
		this.items = [];
		this.currentIndex = 0;
		this._resetQuestion();
		this.scores = [];
		this.error = '';
	}

	async replay() {
		if (this.genre) {
			await this.startQuiz(this.genre);
		}
	}
}

export const quiz = new QuizState();
