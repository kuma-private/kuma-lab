import type { EhonStory, EhonMode, EhonGenerateRequest, EhonPage } from '$lib/types';
import { generateEhon, generateEhonStream } from '$lib/api';
import { mockMomotaro, mockChaos } from '$lib/mock/ehon';

// Mock toggle — flip to false when the /api/ehon/generate backend is ready.
const USE_MOCK = false;

// Issue #81: flip to false to fall back to the non-streaming /api/ehon/generate.
const USE_STREAM = true;

export type EhonPhase =
	| 'mode-select'
	| 'cosmos-input'
	| 'loading'
	| 'viewer'
	| 'error';

export interface CosmosInput {
	protagonist?: string;
	setting?: string;
	theme?: string;
	pageCount?: number;
	protagonistImageDataUrl?: string;
}

class EhonStore {
	phase: EhonPhase = $state('mode-select');
	mode: EhonMode | null = $state(null);
	story: EhonStory | null = $state(null);
	currentPage: number = $state(0);
	errorMessage: string = $state('');
	active: boolean = $state(false);

	// SSE streaming scratch state (Issue #81, Phase A)
	streamingTitle: string = $state('');
	streamingPages: EhonPage[] = $state([]);
	streamingTotal: number = $state(0);

	get totalPages(): number {
		return this.story?.pages.length ?? 0;
	}

	get isLastPage(): boolean {
		return !!this.story && this.currentPage >= this.story.pages.length - 1;
	}

	start() {
		this.active = true;
		this.phase = 'mode-select';
		this.mode = null;
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
		this.streamingTitle = '';
		this.streamingPages = [];
		this.streamingTotal = 0;
	}

	exit() {
		this.active = false;
		this.phase = 'mode-select';
		this.mode = null;
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
		this.streamingTitle = '';
		this.streamingPages = [];
		this.streamingTotal = 0;
	}

	selectMode(m: EhonMode) {
		this.mode = m;
		if (m === 'chaos') {
			void this.generate({ mode: 'chaos', pageCount: 8 });
		} else {
			this.phase = 'cosmos-input';
		}
	}

	submitCosmos(input: CosmosInput) {
		void this.generate({
			mode: 'cosmos',
			pageCount: input.pageCount ?? 8,
			protagonist: input.protagonist?.trim() || undefined,
			setting: input.setting?.trim() || undefined,
			theme: input.theme?.trim() || undefined,
			protagonistImageDataUrl: input.protagonistImageDataUrl || undefined
		});
	}

	async generate(req: EhonGenerateRequest) {
		this.phase = 'loading';
		this.errorMessage = '';
		this.streamingTitle = '';
		this.streamingPages = [];
		this.streamingTotal = 0;

		if (USE_MOCK) {
			try {
				await new Promise((r) => setTimeout(r, 1400));
				this.story = req.mode === 'chaos' ? mockChaos : mockMomotaro;
				this.currentPage = 0;
				this.phase = 'viewer';
			} catch (e) {
				this.errorMessage = e instanceof Error ? e.message : 'えほんを つくれなかったよ';
				this.phase = 'error';
			}
			return;
		}

		if (USE_STREAM) {
			await this.generateStreaming(req);
			return;
		}

		try {
			this.story = await generateEhon(req);
			this.currentPage = 0;
			this.phase = 'viewer';
		} catch (e) {
			this.errorMessage = e instanceof Error ? e.message : 'えほんを つくれなかったよ';
			this.phase = 'error';
		}
	}

	private async generateStreaming(req: EhonGenerateRequest) {
		let errored = false;
		await generateEhonStream(req, {
			onTitle: (title, totalPages, aspectRatio, mode) => {
				this.streamingTitle = title;
				this.streamingTotal = totalPages;
				// Seed an empty story shell so the viewer can mount on first page.
				this.story = {
					title,
					mode: (mode ?? req.mode) as EhonMode,
					aspectRatio,
					pages: []
				};
			},
			onPage: (page) => {
				this.streamingPages = [...this.streamingPages, page];
				if (this.story) {
					// Svelte 5: replace story with a new object so runes see the change.
					this.story = {
						...this.story,
						pages: [...this.story.pages, page]
					};
				} else {
					// Defensive: title event missed — build shell from first page.
					this.story = {
						title: this.streamingTitle,
						mode: req.mode,
						aspectRatio: '3:4',
						pages: [page]
					};
				}
				// First page arrived → flip to viewer immediately.
				if (this.phase !== 'viewer' && !errored) {
					this.currentPage = 0;
					this.phase = 'viewer';
				}
			},
			onDone: () => {
				// Nothing extra — pages already pushed live.
			},
			onError: (err) => {
				errored = true;
				this.errorMessage = err === 'LOGIN_REQUIRED' ? 'LOGIN_REQUIRED' : (err || 'えほんを つくれなかったよ');
				this.phase = 'error';
			}
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
		this.phase = 'mode-select';
		this.mode = null;
		this.story = null;
		this.currentPage = 0;
		this.errorMessage = '';
		this.streamingTitle = '';
		this.streamingPages = [];
		this.streamingTotal = 0;
	}
}

export const ehon = new EhonStore();
