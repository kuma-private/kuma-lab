// Inverse of premium-plan-override: a 'free' localStorage override must
// beat a 'premium' /auth/me. Useful when a Premium dev wants to QA the
// Free experience without logging out.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Plan override — free wins over premium /auth/me', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Premium User',
					email: 'premium@test.com',
					sub: 'premium-user',
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

	test('localStorage free override forces planStore.tier to free', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.addInitScript(() => {
			window.localStorage.setItem('cadenzaPlanOverride', 'free');
		});
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const tier = await page.evaluate(() => {
			const w = window as unknown as { __cadenza?: { planStore?: { tier?: string } } };
			return w.__cadenza?.planStore?.tier ?? null;
		});
		expect(tier).toBe('free');
	});
});
