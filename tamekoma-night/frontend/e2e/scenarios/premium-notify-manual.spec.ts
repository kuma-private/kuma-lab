// Direct unit-style test for bridgeStore.notifyPremiumRequired and
// clearPremiumRequired. Existing tests only exercise these flags via a
// bridge command rejection round-trip; this one calls the methods
// imperatively to lock in the public API surface used by the upgrade
// modal wiring.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('bridgeStore.notifyPremiumRequired (manual)', () => {
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

	test('notifyPremiumRequired sets pending+feature; clearPremiumRequired resets', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Sanity: nothing pending at boot.
		const initial = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						premiumRequiredPending?: boolean;
						premiumRequiredFeature?: string | null;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			return {
				pending: b?.premiumRequiredPending ?? false,
				feature: b?.premiumRequiredFeature ?? null
			};
		});
		expect(initial.pending).toBe(false);
		expect(initial.feature).toBeNull();

		// Imperatively flag a premium-required feature.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: { notifyPremiumRequired?: (f: string) => void };
				};
			};
			w.__cadenza?.bridgeStore?.notifyPremiumRequired?.('manual-test-feature');
		});

		const flagged = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						premiumRequiredPending?: boolean;
						premiumRequiredFeature?: string | null;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			return {
				pending: b?.premiumRequiredPending ?? false,
				feature: b?.premiumRequiredFeature ?? null
			};
		});
		expect(flagged.pending).toBe(true);
		expect(flagged.feature).toBe('manual-test-feature');

		// Clear it.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { bridgeStore?: { clearPremiumRequired?: () => void } };
			};
			w.__cadenza?.bridgeStore?.clearPremiumRequired?.();
		});

		const cleared = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						premiumRequiredPending?: boolean;
						premiumRequiredFeature?: string | null;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			return {
				pending: b?.premiumRequiredPending ?? false,
				feature: b?.premiumRequiredFeature ?? null
			};
		});
		expect(cleared.pending).toBe(false);
		expect(cleared.feature).toBeNull();
	});
});
