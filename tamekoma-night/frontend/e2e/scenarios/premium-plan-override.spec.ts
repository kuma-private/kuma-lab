// localStorage.cadenzaPlanOverride='premium' must take precedence over a
// 'free' /auth/me response so QA can dev the premium UI without backend
// state. This is the dev-override escape hatch in plan.svelte.ts.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Plan override precedence', () => {
	test.beforeEach(async ({ page }) => {
		// /auth/me reports tier=free.
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Free User',
					email: 'free@test.com',
					sub: 'free-user',
					tier: 'free'
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

	test('localStorage premium override wins over a free /auth/me', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		// Seed the override BEFORE the page mounts the planStore.
		await page.addInitScript(() => {
			window.localStorage.setItem('cadenzaPlanOverride', 'premium');
		});
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Even though /auth/me said free, planStore.tier should be premium.
		const tier = await page.evaluate(() => {
			const w = window as unknown as { __cadenza?: { planStore?: { tier?: string } } };
			return w.__cadenza?.planStore?.tier ?? null;
		});
		expect(tier).toBe('premium');
	});
});
