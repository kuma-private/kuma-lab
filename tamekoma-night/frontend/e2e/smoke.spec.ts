// Non-regression smoke test: baseline for the Cadenza Bridge epic.
// Phase 1 only verifies the app boots and the home page renders without crashing.
// The goal is to detect future regressions, not to test Bridge features.

import { expect, test } from '@playwright/test';

test.describe('Cadenza.fm smoke', () => {
	test('home page renders without runtime errors', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto('/');

		// The <title> is set via svelte:head in +layout.svelte
		await expect(page).toHaveTitle(/Cadenza\.fm/);

		// Either the login card (logged out) or the song list (logged in) should be present.
		// Login card has the "Googleでログイン" CTA; song list has the "新規Song" button.
		const anyLanding = page.locator('text=/Cadenza\\.fm|Googleでログイン|新規Song/');
		await expect(anyLanding.first()).toBeVisible({ timeout: 10_000 });

		expect(pageErrors, `unexpected runtime errors: ${pageErrors.map((e) => e.message).join('\n')}`)
			.toEqual([]);
	});
});
