// songStore.clearError() resets the error field to null. Used by the
// UI when the user dismisses an error toast.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

const SONG_ID = 'song-clear-error';

test.describe('Song store clearError', () => {
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
		await page.route(`**/api/songs/${SONG_ID}`, (route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'boom' })
			})
		);
	});

	test('a 500 then clearError resets the error to null', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait until store.error is populated.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { error?: string | null } };
						};
						return w.__cadenza?.songStore?.error ?? null;
					}),
				{ timeout: 5_000 }
			)
			.not.toBeNull();

		// Call clearError.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { clearError?: () => void } };
			};
			w.__cadenza?.songStore?.clearError?.();
		});

		const err = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { error?: string | null } };
			};
			return w.__cadenza?.songStore?.error ?? null;
		});
		expect(err).toBeNull();
	});
});
