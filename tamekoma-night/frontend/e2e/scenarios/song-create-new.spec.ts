// Home → "新規Song" button → POST /api/songs → navigate to the new song page.
// Verifies the create flow surfaces the new id and the redirect lands.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, waitForCadenzaReady } from '../fixtures/window-stores';
import type { SongListItem, Song } from '../../src/lib/types/song';

const NEW_ID = 'song-newly-minted';

test.describe('Create new song', () => {
	test.beforeEach(async ({ page }) => {
		const now = new Date().toISOString();
		const minted: Song = {
			id: NEW_ID,
			title: '無題のスコア',
			bpm: 120,
			timeSignature: '4/4',
			key: 'C',
			chordProgression: '',
			sections: [],
			tracks: [],
			createdBy: 'dev-user',
			createdAt: now,
			lastEditedAt: now,
			buses: [],
			master: { chain: [], volume: 1 }
		};
		const listItem: SongListItem = {
			id: NEW_ID,
			title: minted.title,
			bpm: minted.bpm,
			key: minted.key,
			timeSignature: minted.timeSignature,
			createdByName: 'Dev User',
			createdAt: minted.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: minted.lastEditedAt,
			trackCount: 0,
			sectionCount: 0,
			visibility: 'private'
		};
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
		// GET /api/songs initially returns empty.
		await page.route('**/api/songs', (route) => {
			if (route.request().method() === 'POST') {
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ id: NEW_ID })
				});
				return;
			}
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([listItem])
			});
		});
		await page.route(`**/api/songs/${NEW_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(minted)
			})
		);
	});

	test('clicking "新規Song" creates a song and navigates to its page', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto('/');
		await waitForCadenzaReady(page);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		const newBtn = page.getByRole('button', { name: '新規Song' });
		await expect(newBtn).toBeVisible();
		await newBtn.click();

		// Navigation is via window.location.href, so we wait for the URL to
		// change to the song page.
		await page.waitForURL(`**/song/${NEW_ID}`, { timeout: 5_000 });
		await waitForCadenzaReady(page);
		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { currentSong?: { id?: string } | null } };
						};
						return w.__cadenza?.songStore?.currentSong?.id ?? null;
					}),
				{ timeout: 5_000 }
			)
			.toBe(NEW_ID);
	});
});
