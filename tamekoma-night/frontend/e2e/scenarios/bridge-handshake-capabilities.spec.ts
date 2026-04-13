// The bridge handshake advertises a fixed list of capabilities. The
// frontend bridgeStore mirrors that list; the Mixer / Render / Editor UI
// keys off of it. Verify the published list contains the core surfaces.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

const EXPECTED_CAPABILITIES = [
	'audio',
	'plugins',
	'transport',
	'project',
	'render',
	'editor',
	'autostart',
	'update'
];

test.describe('Bridge handshake capabilities', () => {
	test('advertises the core capability set', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const snap = await readBridgeStore(page);
		expect(snap.capabilities).toEqual(expect.arrayContaining(EXPECTED_CAPABILITIES));
	});
});
