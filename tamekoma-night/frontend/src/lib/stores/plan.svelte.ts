// Plan store — user tier (free/premium). Defaults to 'free' in Phase 1.

export type Plan = 'free' | 'premium';

const OVERRIDE_KEY = 'cadenzaPlanOverride';

function readOverride(): Plan | null {
	if (typeof window === 'undefined') return null;
	try {
		const v = window.localStorage.getItem(OVERRIDE_KEY);
		return v === 'free' || v === 'premium' ? v : null;
	} catch {
		return null;
	}
}

class PlanStore {
	tier = $state<Plan>('free');
	readonly isPremium = $derived(this.tier === 'premium');

	constructor() {
		const override = readOverride();
		if (override) this.tier = override;
	}

	setTier(tier: Plan): void {
		this.tier = tier;
	}
}

export const planStore = new PlanStore();
