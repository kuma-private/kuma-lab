import type { Genre, QuizPhase, QuizItem, BlurStage } from '../types';
import { fetchQuizImages } from '../api';

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
			this.items = await fetchQuizImages(genre);
			this._resetQuestion();
			this.scores = [];
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

		// Exact match, or mutual substring (at least 2 chars)
		if (answer === guess || answer.includes(guess) || guess.includes(answer)) {
			this.revealed = true;
			this.blurStage = 3;
			this.wrongAnswer = false;
				this.scores.push(Math.max(0, 3 - this.hintsUsed));
			return true;
		}

		this.wrongAnswer = true;
		setTimeout(() => { this.wrongAnswer = false; }, 800);
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
		this.hintsUsed = 0;
	}

	get totalScore(): number {
		return this.scores.reduce((a, b) => a + b, 0);
	}

	get maxScore(): number {
		return this.items.length * 3;
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
