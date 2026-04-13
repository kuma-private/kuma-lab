// Home page with zero songs in the list must still render the "新規Song"
// CTA so the user can create their first one.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

test.describe('Empty song list', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Dev User',
					email: 'dev@test.com',
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

	test('home page with 0 songs still shows the "新規Song" CTA', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// CTA button is rendered.
		const newBtn = page.getByRole('button', { name: '新規Song' });
		await expect(newBtn).toBeVisible();

		// No song-cards rendered.
		await expect(page.locator('a.song-card')).toHaveCount(0);

		// Empty hint text is visible.
		await expect(page.locator('.empty-hint').first()).toBeVisible();
	});
});
