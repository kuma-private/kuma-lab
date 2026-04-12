// Verify the real bridgeStore exposes built-ins via fullCatalog regardless of
// whether a Bridge scan happened.
import { describe, expect, it } from 'vitest';
import { bridgeStore } from '$lib/stores/bridge.svelte';

describe('bridgeStore.builtinCatalog', () => {
	it('contains gain/svf/compressor', () => {
		const ids = bridgeStore.builtinCatalog.map((p) => p.id);
		expect(ids).toContain('gain');
		expect(ids).toContain('svf');
		expect(ids).toContain('compressor');
	});

	it('all built-ins are marked format=builtin', () => {
		for (const entry of bridgeStore.builtinCatalog) {
			expect(entry.format).toBe('builtin');
			expect(entry.vendor).toBe('Cadenza');
		}
	});
});

describe('bridgeStore.fullCatalog', () => {
	it('returns built-ins + dynamic catalog', () => {
		// Dynamic catalog is empty in Node/test env (no Bridge connection).
		const full = bridgeStore.fullCatalog;
		expect(full.length).toBeGreaterThanOrEqual(bridgeStore.builtinCatalog.length);
		// Built-ins come first so UI renders them at the top.
		expect(full[0].id).toBe('gain');
	});
});

describe('bridgeStore.meters', () => {
	it('starts empty — no events wire it in Phase 5', () => {
		expect(bridgeStore.meters).toEqual({});
	});
});
