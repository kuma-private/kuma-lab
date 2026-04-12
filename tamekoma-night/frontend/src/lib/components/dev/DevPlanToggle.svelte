<script lang="ts">
	// Dev-only toggle exposing planStore tier and bridge connection state.
	// Renders nothing in production builds.

	import { planStore, type Plan } from '$lib/stores/plan.svelte';
	import { bridgeStore } from '$lib/stores/bridge.svelte';

	const STORAGE_KEY = 'cadenzaPlanOverride';

	function setTier(tier: Plan): void {
		planStore.setTier(tier);
		try {
			window.localStorage.setItem(STORAGE_KEY, tier);
		} catch {
			/* ignore */
		}
	}

	function bridgeLabel(state: string): string {
		switch (state) {
			case 'connected':
				return 'connected';
			case 'connecting':
				return 'connecting…';
			case 'disconnected':
				return 'disconnected';
			default:
				return 'idle';
		}
	}
</script>

{#if import.meta.env.DEV}
	<div class="dev-plan-toggle" role="group" aria-label="Dev plan toggle">
		<span class="label">Plan:</span>
		<button
			class:active={planStore.tier === 'free'}
			onclick={() => setTier('free')}
			type="button"
		>
			free
		</button>
		<button
			class:active={planStore.tier === 'premium'}
			onclick={() => setTier('premium')}
			type="button"
		>
			premium
		</button>
		<span class="bridge" data-state={bridgeStore.state}>
			Bridge: {bridgeLabel(bridgeStore.state)}
		</span>
	</div>
{/if}

<style>
	.dev-plan-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 8px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-family: var(--font-mono, monospace);
		font-size: 0.7rem;
		color: #ddd;
	}

	.label {
		opacity: 0.65;
	}

	button {
		background: transparent;
		color: #aaa;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 1px 8px;
		cursor: pointer;
		font: inherit;
	}

	button:hover {
		color: #fff;
		border-color: rgba(255, 255, 255, 0.3);
	}

	button.active {
		background: var(--accent-primary, #e8a84c);
		color: #111;
		border-color: var(--accent-primary, #e8a84c);
	}

	.bridge {
		margin-left: 4px;
		padding-left: 8px;
		border-left: 1px solid rgba(255, 255, 255, 0.08);
		opacity: 0.7;
	}

	.bridge[data-state='connected'] {
		color: #6ce99e;
		opacity: 1;
	}

	.bridge[data-state='connecting'] {
		color: #e8c44c;
	}

	.bridge[data-state='disconnected'] {
		color: #e06060;
	}
</style>
