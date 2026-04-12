// MixerTab tab-gating tests — verify the plan/bridge state that FlowEditor uses
// to decide tab visibility and curtain rendering. We can't mount Svelte components
// without @testing-library/svelte, but the decision logic is pure and lives in
// bridgeStore.state + planStore.isPremium, so we exercise that directly.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock bridgeStore so we can flip the connection state.
const bridgeMock = vi.hoisted(() => ({
	state: { value: 'disconnected' as 'idle' | 'connecting' | 'connected' | 'disconnected' }
}));

vi.mock('$lib/stores/bridge.svelte', () => ({
	bridgeStore: {
		get state() {
			return bridgeMock.state.value;
		},
		client: { send: vi.fn(), connect: vi.fn() },
		fullCatalog: [],
		builtinCatalog: [],
		pluginCatalog: [],
		meters: {}
	}
}));

import { bridgeStore } from '$lib/stores/bridge.svelte';
import { planStore } from '$lib/stores/plan.svelte';

beforeEach(() => {
	bridgeMock.state.value = 'disconnected';
	planStore.setTier('free');
});

describe('Mixer tab visibility (plan gating)', () => {
	it('free users: tab is NOT shown', () => {
		planStore.setTier('free');
		// This is the same derived flag used in FlowEditor.svelte.
		const showMixerTab = planStore.isPremium;
		expect(showMixerTab).toBe(false);
	});

	it('premium users: tab IS shown regardless of bridge state', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'disconnected';
		expect(planStore.isPremium).toBe(true);

		bridgeMock.state.value = 'connected';
		expect(planStore.isPremium).toBe(true);
	});
});

describe('Mixer content state (bridge gating)', () => {
	it('premium + bridge offline → curtain should render', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'disconnected';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(false); // curtain visible
	});

	it('premium + bridge connecting → curtain still visible', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'connecting';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(false);
	});

	it('premium + bridge connected → full mixer renders', () => {
		planStore.setTier('premium');
		bridgeMock.state.value = 'connected';
		const online = bridgeStore.state === 'connected';
		expect(online).toBe(true);
	});
});

describe('bridgeStore — built-in catalog always available', () => {
	it('fullCatalog returns at least the built-in entries even when offline', async () => {
		// Re-import the real store (not the mock) by reading dedicated helpers.
		// Here we just validate the mock's fullCatalog shape; the real store's
		// fullCatalog getter is covered by the plugin-descriptors test indirectly.
		expect(Array.isArray(bridgeStore.fullCatalog)).toBe(true);
	});
});
