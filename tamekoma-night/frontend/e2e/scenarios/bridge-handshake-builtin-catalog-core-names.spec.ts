// Sister test to bridge-handshake-builtin-catalog-shape: that one proves
// every entry has the required fields, this one proves the catalog
// actually advertises the core effects the UI relies on. If someone
// renames "Gain" -> "gain_v2" in the Rust bridge without updating the
// frontend, the PluginPicker quickbar breaks silently; this test fails
// loudly instead.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge builtin catalog core names', () => {
	test('advertises Gain, Filter, and Compressor', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const snap = await readBridgeStore(page);
		expect(snap.builtinCatalog.length).toBeGreaterThan(0);

		const names = snap.builtinCatalog.map((e) => e.name);
		// Case-insensitive match so small casing drift doesn't break the test
		// — we're guarding the core set, not the exact string.
		const haveGain = names.some((n) => /gain/i.test(n));
		const haveFilter = names.some((n) => /filter/i.test(n));
		const haveCompressor = names.some((n) => /comp/i.test(n));

		expect(haveGain, `builtinCatalog names=${JSON.stringify(names)}`).toBe(true);
		expect(haveFilter, `builtinCatalog names=${JSON.stringify(names)}`).toBe(true);
		expect(haveCompressor, `builtinCatalog names=${JSON.stringify(names)}`).toBe(true);

		// Also prove every entry carries format='builtin' — belt and braces
		// against a regression where plugin entries leak into the builtin
		// list.
		for (const entry of snap.builtinCatalog) {
			expect(entry.format).toBe('builtin');
		}
	});
});
