// Read bridgeStore.handshakeResult.bridgeVersion twice during the same
// session and confirm it stays stable. The handshake is a one-shot event
// at connect time, so a subsequent read must never mutate. This guards
// against a future refactor that rebinds bridgeVersion on every plugin
// scan or similar side effect.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Bridge handshake — bridgeVersion stability', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Premium User',
					email: 'premium@test.com',
					sub: 'dev-user',
					tier: 'premium'
				})
			})
		);
		await page.route('**/api/songs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			})
		);
	});

	test('handshakeResult.bridgeVersion unchanged between two reads', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 10_000 })
			.toBe('connected');

		const first = await readBridgeStore(page);
		expect(first.bridgeVersion).toBeTruthy();
		expect(first.handshakeResult?.bridgeVersion).toBeTruthy();
		expect(first.handshakeResult?.bridgeVersion).toBe(first.bridgeVersion);

		// Pause a beat to give any latent event handler a chance to clobber
		// the field. 600ms is well under the fixture deadline and well over
		// a typical websocket RTT on localhost.
		await page.waitForTimeout(600);

		const second = await readBridgeStore(page);
		expect(second.bridgeVersion).toBe(first.bridgeVersion);
		expect(second.handshakeResult?.bridgeVersion).toBe(first.handshakeResult?.bridgeVersion);

		// Sanity: still connected. If the bridge dropped us between reads
		// the stability check would be meaningless.
		expect(second.state).toBe('connected');
	});
});
