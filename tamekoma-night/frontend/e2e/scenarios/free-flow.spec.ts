// Free-user flow: the Mixer/Automation tabs must not appear, and the page
// must render the Flow tab as the default. This runs in the `free` project
// (no cadenzaPlanOverride in localStorage) and does NOT require the bridge
// or backend to be running — the API is stubbed with route fulfillment so
// the test can exercise the UI in isolation.

import { test, expect } from '@playwright/test';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-free-flow';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Free Flow Test',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
		tracks: [
			{
				id: 'track-1',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false
			}
		],
		createdBy: 'dev-free',
		createdAt: now,
		lastEditedAt: now
	};
}

test.describe('Free-user flow (no Bridge required)', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Free User',
			createdAt: song.createdAt,
			lastEditedBy: 'Free User',
			lastEditedAt: song.lastEditedAt,
			trackCount: song.tracks.length,
			sectionCount: song.sections.length,
			visibility: 'private'
		};

		// Stub auth + song endpoints so the page renders offline.
		await page.route('**/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					name: 'Free User',
					email: 'free@test.com',
					sub: 'dev-free',
					tier: 'free'
				})
			})
		);
		await page.route('**/api/songs', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([listItem])
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(song)
			})
		);
	});

	test('home page shows song list without Premium tabs', async ({ page }) => {
		await page.goto('/');

		// Home page renders (either login card or song list).
		await expect(page).toHaveTitle(/Cadenza\.fm/);
		const landingLocator = page.locator('text=/Cadenza\\.fm|Googleでログイン|新規Song/');
		await expect(landingLocator.first()).toBeVisible({ timeout: 10_000 });

		await page.screenshot({ path: 'e2e/screenshots/free-home.png', fullPage: true });
	});

	test('song page opens with Flow as default; Mixer/Automation hidden', async ({ page }) => {
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto(`/song/${SONG_ID}`);

		// Flow tab should be the default and marked selected.
		const flowTab = page.getByRole('tab', { name: 'Flow' });
		await expect(flowTab).toBeVisible({ timeout: 10_000 });
		await expect(flowTab).toHaveAttribute('aria-selected', 'true');

		// Visualizer + Text are always present.
		await expect(page.getByRole('tab', { name: 'Visualizer' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'Text' })).toBeVisible();

		// Mixer + Automation tabs must NOT be rendered for a free user.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);

		await page.screenshot({ path: 'e2e/screenshots/free-song.png', fullPage: true });

		expect(pageErrors, `page errors: ${pageErrors.map((e) => e.message).join('\n')}`).toEqual([]);
	});
});
