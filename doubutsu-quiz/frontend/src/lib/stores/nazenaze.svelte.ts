import type { NazenazeStory, NazenazeMode, NazenazeGenerateRequest } from '$lib/types';
import { generateNazenaze } from '$lib/api';

export type NazenazePhase = 'input' | 'loading' | 'viewer' | 'error';

class NazenazeStore {
	phase: NazenazePhase = $state('input');
	mode: NazenazeMode = $state('true');
	question: string = $state('');
	pageCount: number = $state(5);
	story: NazenazeStory | null = $state(null);
	currentPage: number = $state(0);
	errorMessage: string = $state('');
	active: boolean = $state(false);

	get totalPages(): number {
		return this.story?.pages.length ?? 0;
	}

	get isLastPage(): boolean {
		return !!this.story && this.currentPage >= this.story.pages.length - 1;
	}

	start() {
		this.active = true;
		this.phase = 'input';
		this.mode = 'true';
		this.question = '';
		this.pageCount = 5;
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
	}

	exit() {
		this.active = false;
		this.phase = 'input';
		this.question = '';
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
	}

	setMode(m: NazenazeMode) {
		this.mode = m;
	}

	setQuestion(q: string) {
		this.question = q;
	}

	setPageCount(n: number) {
		this.pageCount = n;
	}

	submit() {
		if (!this.question.trim()) return;
		void this.generate({
			mode: this.mode,
			question: this.question.trim(),
			pageCount: this.pageCount
		});
	}

	async generate(req: NazenazeGenerateRequest) {
		this.phase = 'loading';
		this.errorMessage = '';
		try {
			this.story = await generateNazenaze(req);
			this.currentPage = 0;
			this.phase = 'viewer';
		} catch (e) {
			this.errorMessage = e instanceof Error ? e.message : 'こたえが みつからなかった';
			this.phase = 'error';
		}
	}

	nextPage() {
		if (!this.story) return;
		if (this.currentPage < this.story.pages.length - 1) {
			this.currentPage++;
		}
	}

	prevPage() {
		if (this.currentPage > 0) this.currentPage--;
	}

	reset() {
		this.phase = 'input';
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
	}
}

export const nazenaze = new NazenazeStore();
