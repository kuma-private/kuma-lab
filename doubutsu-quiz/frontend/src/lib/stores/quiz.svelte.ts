import type { Genre, QuizPhase, QuizItem, BlurStage } from '../types';
import { fetchQuizImages } from '../api';

class QuizState {
	phase: QuizPhase = $state('select');
	genre: Genre | null = $state(null);
	items: QuizItem[] = $state([]);
	currentIndex: number = $state(0);
	blurStage: BlurStage = $state(0);
	error: string = $state('');
	revealed: boolean = $state(false);

	async startQuiz(genre: Genre) {
		this.genre = genre;
		this.phase = 'loading';
		this.error = '';

		try {
			this.items = await fetchQuizImages(genre);
			this.currentIndex = 0;
			this.blurStage = 0;
			this.revealed = false;
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

	tap() {
		if (this.revealed) return;

		if (this.blurStage < 3) {
			this.blurStage = (this.blurStage + 1) as BlurStage;
		}

		if (this.blurStage === 3) {
			this.revealed = true;
		}
	}

	nextQuestion() {
		if (this.currentIndex < this.items.length - 1) {
			this.currentIndex++;
			this.blurStage = 0;
			this.revealed = false;
		} else {
			this.phase = 'complete';
		}
	}

	reset() {
		this.phase = 'select';
		this.genre = null;
		this.items = [];
		this.currentIndex = 0;
		this.blurStage = 0;
		this.revealed = false;
		this.error = '';
	}

	async replay() {
		if (this.genre) {
			await this.startQuiz(this.genre);
		}
	}
}

export const quiz = new QuizState();
