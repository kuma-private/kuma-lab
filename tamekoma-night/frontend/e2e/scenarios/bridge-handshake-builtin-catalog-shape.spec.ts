// The bridge's builtin catalog must include the format/uid/name fields
// in a consistent shape that the PluginPicker depends on.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge builtin catalog shape', () => {
	test('every builtin entry has format/uid/name fields', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const snap = await readBridgeStore(page);
		expect(snap.builtinCatalog.length).toBeGreaterThan(0);
		for (const entry of snap.builtinCatalog) {
			expect(typeof entry.format).toBe('string');
			expect(typeof entry.id).toBe('string');
			expect(typeof entry.name).toBe('string');
			expect(entry.format.length).toBeGreaterThan(0);
			expect(entry.id.length).toBeGreaterThan(0);
			expect(entry.name.length).toBeGreaterThan(0);
		}
	});
});
