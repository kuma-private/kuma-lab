// planStore.setTier called multiple times in rapid succession — the final
// call wins. Locks in the store's last-write semantics so a future refactor
// that accidentally debounces or drops intermediate writes does not fall
// through the cracks. Complements premium-plan-override(-free).spec.ts
// which only covers the constructor-time override.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('planStore.setTier — multiple calls, last wins', () => {
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

	test('setTier(free)→setTier(premium)→setTier(free): final tier=free', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Fire three setTier calls back-to-back. The last one (free) must win.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
			};
			const p = w.__cadenza?.planStore;
			if (!p?.setTier) throw new Error('planStore.setTier not exposed');
			p.setTier('free');
			p.setTier('premium');
			p.setTier('free');
		});

		const tier = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { tier?: string; isPremium?: boolean } };
			};
			return {
				tier: w.__cadenza?.planStore?.tier ?? null,
				isPremium: w.__cadenza?.planStore?.isPremium ?? null
			};
		});
		expect(tier.tier).toBe('free');
		expect(tier.isPremium).toBe(false);

		// And the inverse — finish on premium.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
			};
			const p = w.__cadenza?.planStore;
			p?.setTier?.('premium');
			p?.setTier?.('free');
			p?.setTier?.('premium');
		});
		const after = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { tier?: string; isPremium?: boolean } };
			};
			return {
				tier: w.__cadenza?.planStore?.tier ?? null,
				isPremium: w.__cadenza?.planStore?.isPremium ?? null
			};
		});
		expect(after.tier).toBe('premium');
		expect(after.isPremium).toBe(true);
	});
});
