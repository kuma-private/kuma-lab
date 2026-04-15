import { fetchRandomAnimals } from '$lib/api';
import { loadImage } from '$lib/imageLoader';
import { tracePolygon } from '$lib/towerPhysics';

export interface IrasutoyaItem {
	id: string;
	title: string;
	imageUrl: string;
}

export type TowerPhase = 'input' | 'loading' | 'playing' | 'gameover';

const BEST_KEY = 'doubutsu-quiz:tower:best';
const REFETCH_THRESHOLD = 5;

function readBest(): number {
	if (typeof localStorage === 'undefined') return 0;
	const raw = localStorage.getItem(BEST_KEY);
	if (!raw) return 0;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function writeBest(n: number) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(BEST_KEY, String(n));
}

class TowerStore {
	active: boolean = $state(false);
	phase: TowerPhase = $state('input');
	entries: IrasutoyaItem[] = $state([]);
	nextIndex: number = $state(0);
	score: number = $state(0);
	best: number = $state(readBest());
	errorMessage: string = $state('');

	private refetching = false;

	async start(): Promise<void> {
		this.phase = 'loading';
		this.errorMessage = '';
		this.score = 0;
		this.nextIndex = 0;
		try {
			const items = await this.fetchBatch();
			this.entries = items;
			// Kick off sprite + collision-polygon preloads in parallel. Sprite
			// fetches go through imageLoader's 5-parallel throttle; polygon
			// traces hit /api/image-proxy which has no throttle but each trace
			// is mostly CPU-bound on the client (canvas + marching squares).
			await Promise.allSettled([
				...items.map((e) => loadImage(e.imageUrl)),
				...items.slice(0, 5).map((e) => tracePolygon(e.imageUrl))
			]);
			void Promise.allSettled(items.slice(5).map((e) => tracePolygon(e.imageUrl)));
			this.phase = 'playing';
		} catch (e) {
			this.errorMessage = e instanceof Error ? e.message : 'よみこみ しっぱい';
			this.phase = 'input';
		}
	}

	advance(): void {
		this.nextIndex++;
		const remaining = this.entries.length - this.nextIndex;
		if (remaining <= REFETCH_THRESHOLD && !this.refetching) {
			void this.refetchMore();
		}
	}

	gameOver(finalCount: number): void {
		this.score = finalCount;
		if (finalCount > this.best) {
			this.best = finalCount;
			writeBest(finalCount);
		}
		this.phase = 'gameover';
	}

	reset(): void {
		this.phase = 'input';
		this.score = 0;
		this.nextIndex = 0;
		this.errorMessage = '';
		this.entries = [];
	}

	exit(): void {
		this.active = false;
		this.phase = 'input';
		this.entries = [];
		this.nextIndex = 0;
		this.score = 0;
		this.errorMessage = '';
	}

	open(): void {
		this.active = true;
		this.phase = 'input';
		this.errorMessage = '';
	}

	private async fetchBatch(): Promise<IrasutoyaItem[]> {
		const first = await fetchRandomAnimals(30);
		if (first.length >= 10) return first;
		const second = await fetchRandomAnimals(30);
		return second;
	}

	private async refetchMore(): Promise<void> {
		this.refetching = true;
		try {
			const more = await this.fetchBatch();
			void Promise.allSettled(more.map((e) => loadImage(e.imageUrl)));
			this.entries = [...this.entries, ...more];
		} catch {
			// Silent — player can still finish with what's loaded.
		} finally {
			this.refetching = false;
		}
	}
}

export const tower = new TowerStore();
