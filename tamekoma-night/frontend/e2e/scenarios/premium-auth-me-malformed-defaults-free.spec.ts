// /auth/me returning a 200 body with no `tier` field (e.g. an older
// backend shape) must still land the user at tier='free' rather than
// crashing or flipping to a garbage value. planStore.initFromAuth()
// ignores anything that isn't 'free' | 'premium', so undefined stays free.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('planStore — /auth/me malformed body defaults to free', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});

		// No `tier` field — just the base profile shape an older
		// backend version might return.
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Legacy User',
					email: 'legacy@test.com',
					sub: 'legacy-user'
				})
			})
		);
		await page.route('**/api/bridge/ticket', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not_premium' })
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

	test('missing tier field leaves planStore.tier at the free default', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();

		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));

		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		await page.waitForTimeout(500);

		const snap = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					planStore?: { tier?: 'free' | 'premium'; isPremium?: boolean };
				};
			};
			return {
				tier: w.__cadenza?.planStore?.tier ?? null,
				isPremium: w.__cadenza?.planStore?.isPremium ?? null
			};
		});

		expect(snap.tier).toBe('free');
		expect(snap.isPremium).toBe(false);
		expect(errors).toEqual([]);
	});
});
