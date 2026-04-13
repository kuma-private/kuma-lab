// Bridge update badge scenario.
//
// When the bridge handshake.ack reports updateAvailable=true, the
// frontend's BridgeUpdateBadge in the header should become visible.
// This test simulates that path by directly mutating bridgeStore's
// handshakeResult so the reactivity propagates the badge.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';

test.describe('Bridge update badge', () => {
	test('appears when handshakeResult.updateAvailable is true', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();

		await page.goto('/');
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Inject an update-available state. The store-level field flows into
		// BridgeUpdateBadge via Svelte 5 runes; the badge renders when
		// handshakeResult.updateAvailable === true.
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
				updateAvailable: true,
				latestVersion: '0.2.0',
				releaseNotes: 'Synthetic test update',
				releaseUrl: 'https://example.invalid/release/v0.2.0'
			};
			b.updateAvailable = true;
		});

		// The badge has data-testid="bridge-update-badge" or a label "更新".
		// Use a flexible selector that matches either.
		const badge = page
			.locator('[data-testid="bridge-update-badge"], button:has-text("更新")')
			.first();
		await expect(badge).toBeVisible({ timeout: 5_000 });

		await page.screenshot({
			path: 'e2e/screenshots/bridge-update-badge.png',
			fullPage: true
		});
	});
});
