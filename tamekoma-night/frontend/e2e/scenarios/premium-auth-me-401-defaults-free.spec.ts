// /auth/me returning 401 must not crash the app — planStore should stay
// at its default 'free' tier. Guards against a regression where an auth
// failure threw unhandled and dropped the whole layout. Also proves the
// bridge still boots fine under an unauthenticated backend response.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('planStore — /auth/me 401 defaults to free', () => {
	test.beforeEach(async ({ page }) => {
		// Wipe the premium override so we rely purely on /auth/me for tier.
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});

		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 401,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'unauthorized' })
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

	test('401 from /auth/me leaves planStore.tier at the free default', async ({
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

		// Give any async /auth/me handler a beat to land.
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
		// And the 401 must not have thrown anything through to the
		// unhandled-error channel.
		expect(errors).toEqual([]);
	});
});
