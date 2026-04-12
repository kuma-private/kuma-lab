// Bridge handshake scenario: with the full stack running (bridge + backend
// spawned by the fixture, Vite managed by Playwright), the frontend should
// reach `state === 'connected'` within a few seconds of mount and populate
// handshakeResult + the built-in plugin catalog.
//
// This spec lives under the `premium` project so the Mixer/Automation
// code paths are exercised, but the core handshake logic itself is tier-
// agnostic. We rely on window.__cadenza.bridgeStore for verification.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';

test.describe('Bridge handshake', () => {
	test('connects and publishes bridgeVersion + builtin catalog', async ({
		page,
		bridge,
		backend
	}) => {
		// Make sure the fixtures are actually live before navigating.
		expect(bridge.url).toMatch(/^ws:\/\/127\.0\.0\.1:7890$/);
		expect(backend.baseUrl).toMatch(/^http:\/\/localhost:52731$/);

		await page.goto('/');

		// Poll the bridge store until state flips to 'connected' or we time out.
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const snap = await readBridgeStore(page);
		expect(snap.state).toBe('connected');
		expect(snap.handshakeResult).not.toBeNull();
		expect(snap.handshakeResult?.bridgeVersion).toBeTruthy();
		expect(snap.bridgeVersion).toBeTruthy();

		// Built-in catalog is always present (bridge store seeds it locally).
		expect(snap.builtinCatalog.length).toBeGreaterThanOrEqual(3);
		const builtinNames = snap.builtinCatalog.map((e) => e.name).sort();
		expect(builtinNames).toEqual(expect.arrayContaining(['Compressor', 'Filter', 'Gain']));

		await page.screenshot({ path: 'e2e/screenshots/bridge-handshake.png', fullPage: true });
	});
});
