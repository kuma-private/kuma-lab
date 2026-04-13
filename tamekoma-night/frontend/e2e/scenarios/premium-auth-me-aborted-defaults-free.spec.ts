// When /auth/me never completes (network abort — equivalent to "no
// response at all"), planStore must default to 'free' and the home page
// must still render without crashing. Sister test to
// premium-auth-me-401-defaults-free (which forces a 401) and
// premium-auth-me-malformed-defaults-free (which forces a malformed body).
// This one aborts the request entirely to guard against a regression where
// the store only handles its own mock shapes and a silent network failure
// leaves planStore in an unresolved state.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('planStore — /auth/me aborted defaults to free', () => {
	test.beforeEach(async ({ page }) => {
		// Clear the premium override so storageState doesn't force tier=premium.
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});
		// Abort /auth/me to simulate "no response at all" — the planStore
		// must still default to its 'free' baseline.
		await page.route('**/auth/me', (route) => route.abort('failed'));
		// Mock the songs list so the page doesn't hang on a 401 loop.
		await page.route('**/api/songs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([])
			})
		);
		await page.route('**/api/bridge/ticket', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not_premium' })
			})
		);
	});

	test('home page renders and planStore.tier is free when /auth/me is aborted', async ({
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

		// Sanity: the document body is alive (page didn't crash).
		const bodyVisible = await page.locator('body').isVisible();
		expect(bodyVisible).toBe(true);

		// Give any async /auth/me settle a beat.
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
