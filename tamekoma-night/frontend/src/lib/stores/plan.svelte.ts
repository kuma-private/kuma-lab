// Plan store — user tier (free/premium).
// Phase 4 wires this to the backend /auth/me tier field.
// The dev localStorage override still takes precedence so QA can flip plans
// without hitting Stripe / Firestore.

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

	/**
	 * Apply the tier reported by /auth/me. Ignored if the dev override is set,
	 * so local QA of the Premium UI keeps working regardless of backend state.
	 */
	initFromAuth(tier: Plan | undefined): void {
		if (readOverride()) return;
		if (tier === 'free' || tier === 'premium') {
			this.tier = tier;
		}
	}
}

export const planStore = new PlanStore();
