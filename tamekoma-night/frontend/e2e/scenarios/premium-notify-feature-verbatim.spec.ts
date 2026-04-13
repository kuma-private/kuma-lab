// Exercises bridgeStore.notifyPremiumRequired across a spread of feature
// strings (empty, ASCII slug, full sentence with spaces, unicode, long
// identifier-style). The contract is: whatever the caller passes must
// land in premiumRequiredFeature verbatim. This matters because the
// upgrade modal renders this string to the user — any coercion (trim,
// lowercase, truncation) would be a visible regression. Sister to
// premium-notify-manual (which only covers a single happy-path value).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

const FEATURES = [
	'vst3',
	'clap-effect',
	'Render WAV (commercial)',
	'レンダリング',
	'very.long.feature.identifier.with.dots.and_underscores'
];

test.describe('bridgeStore.notifyPremiumRequired — feature string preserved verbatim', () => {
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

	test('each feature string round-trips unchanged through notify+clear', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		for (const feature of FEATURES) {
			// Flag the feature.
			await page.evaluate((f) => {
				const w = window as unknown as {
					__cadenza?: {
						bridgeStore?: { notifyPremiumRequired?: (s: string) => void };
					};
				};
				w.__cadenza?.bridgeStore?.notifyPremiumRequired?.(f);
			}, feature);

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
			expect(flagged.feature).toBe(feature);

			// Clear before the next iteration so we know each assertion is
			// driven by its own notify call and not a stale value.
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
		}
	});
});
