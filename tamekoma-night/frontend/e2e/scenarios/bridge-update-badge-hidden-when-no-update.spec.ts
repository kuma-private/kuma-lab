// Negative path of bridge-update-badge: when the handshake.ack reports
// updateAvailable=false, the BridgeUpdateBadge in the header must NOT
// render. The positive case is already covered; this guards against the
// regression where the badge renders unconditionally (e.g. a missing
// conditional in the Svelte template).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';

test.describe('Bridge update badge — hidden when no update', () => {
	test('badge does NOT render when updateAvailable=false', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();

		await page.goto('/');
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Explicitly pin updateAvailable to false in case the real bridge
		// ever starts reporting otherwise during a test run.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						handshakeResult: unknown;
						updateAvailable: boolean;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			if (!b) return;
			b.handshakeResult = {
				bridgeVersion: '0.1.0',
				capabilities: ['audio'],
				updateAvailable: false,
				latestVersion: null,
				releaseNotes: null,
				releaseUrl: null
			};
			b.updateAvailable = false;
		});

		// Give Svelte a tick to react.
		await page.waitForTimeout(250);

		const snap = await readBridgeStore(page);
		expect(snap.updateAvailable).toBe(false);

		// The badge has data-testid="bridge-update-badge". It must not be
		// in the DOM at all (or if present, hidden — count()==0 covers the
		// common "not rendered" case).
		const badge = page.locator('[data-testid="bridge-update-badge"]');
		await expect(badge).toHaveCount(0);

		// Also assert the literal "更新" label isn't floating somewhere in
		// the header. Scope to header to avoid false positives from other
		// page content using the same word.
		const headerUpdate = page.locator('header').locator('text=更新');
		await expect(headerUpdate).toHaveCount(0);
	});
});
