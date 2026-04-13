// /api/songs/{id} returns 404 — the song page must not crash, the store
// must capture an error, and the layout must remain interactive (i.e.
// __cadenza is still attached).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';

const SONG_ID = 'song-does-not-exist';

test.describe('Song page — 404 handling', () => {
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
				status: 404,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not found' })
			})
		);
	});

	test('404 sets songStore.error and leaves the rest of the app addressable', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await waitForCadenzaReady(page);

		// Bridge handshake should still complete normally.
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// songStore.error should be populated; currentSong should be null.
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { error?: string | null; currentSong?: unknown } };
						};
						return {
							hasError: !!w.__cadenza?.songStore?.error,
							hasSong: !!w.__cadenza?.songStore?.currentSong
						};
					}),
				{ timeout: 5_000 }
			)
			.toMatchObject({ hasError: true, hasSong: false });
	});
});
