import type { CeremonyPhase, GenerateResponse } from './types';
import { generate } from '$lib/api';

class CeremonyMachine {
	phase = $state<CeremonyPhase>('IDLE');
	response = $state<GenerateResponse | null>(null);
	error = $state<string | null>(null);
	isLoading = $state(false);

	async summon() {
		if (this.phase !== 'IDLE') return;
		this.phase = 'SUMMONING';
		this.error = null;
		this.isLoading = true;

		try {
			const data = await generate();
			this.response = data;
			this.isLoading = false;
		} catch (e) {
			this.error = e instanceof Error ? e.message : '召喚に失敗しました';
			this.isLoading = false;
			this.phase = 'IDLE';
		}
	}

	summonComplete() {
		if (this.phase !== 'SUMMONING' || !this.response) return;
		this.phase = 'SHOWING';
	}

	purify() {
		if (this.phase !== 'SHOWING') return;
		this.phase = 'PURIFYING';
	}

	purifyComplete() {
		if (this.phase !== 'PURIFYING') return;
		this.phase = 'DONE';
	}

	reset() {
		this.phase = 'IDLE';
		this.response = null;
		this.error = null;
		this.isLoading = false;
	}
}

export const ceremony = new CeremonyMachine();
