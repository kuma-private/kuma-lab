import type { NazenazeStory, NazenazeMode, NazenazeGenerateRequest } from '$lib/types';
import { generateNazenaze, generateNazenazeStream } from '$lib/api';

export type NazenazePhase = 'input' | 'loading' | 'viewer' | 'error';

/**
 * Phase B+ streaming flag. When true, nazenaze generation uses the SSE
 * endpoint so the viewer opens on the title event (~3-5s) instead of waiting
 * for the full Claude + Imagen round trip (~16-22s).
 */
const USE_STREAM = true;

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
		if (USE_STREAM) {
			await this.generateStreaming(req);
			return;
		}
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

	/**
	 * Phase B+ streaming generate. Initializes the story on the title event
	 * (flips phase to viewer immediately) and appends pages as they arrive.
	 * Background image arrives later and is patched onto the story.
	 */
	async generateStreaming(req: NazenazeGenerateRequest) {
		this.phase = 'loading';
		this.errorMessage = '';
		this.story = null;
		this.currentPage = 0;

		let settled = false;
		await new Promise<void>((resolve) => {
			const finish = () => {
				if (settled) return;
				settled = true;
				resolve();
			};

			void generateNazenazeStream(req, {
				onTitle: (title, _totalPages, aspectRatio, mode) => {
					this.story = {
						title,
						mode,
						aspectRatio,
						backgroundImageDataUrl: '',
						pages: []
					};
					this.currentPage = 0;
					this.phase = 'viewer';
				},
				onPage: (page) => {
					if (!this.story) return;
					// Reassign the pages array to trigger Svelte 5 reactivity.
					this.story = {
						...this.story,
						pages: [...this.story.pages, page]
					};
				},
				onBackground: (url) => {
					if (!this.story) return;
					this.story = { ...this.story, backgroundImageDataUrl: url };
				},
				onDone: () => {
					finish();
				},
				onError: (err) => {
					this.errorMessage = err || 'こたえが みつからなかった';
					this.phase = 'error';
					finish();
				}
			});
		});
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
