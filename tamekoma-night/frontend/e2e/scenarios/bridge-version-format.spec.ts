// The bridge handshake reports its version string. Verify the frontend
// store mirrors a non-empty value matching a reasonable semver shape.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge version format', () => {
	test('handshake reports a semver-like bridgeVersion', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const snap = await readBridgeStore(page);
		expect(snap.bridgeVersion).toBeTruthy();
		// Loose semver: at least major.minor, optionally with pre-release.
		expect(snap.bridgeVersion).toMatch(/^\d+\.\d+/);
		expect(snap.handshakeResult?.bridgeVersion).toBe(snap.bridgeVersion);
	});
});
