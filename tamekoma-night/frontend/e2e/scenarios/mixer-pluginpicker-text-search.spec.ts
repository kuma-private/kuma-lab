// PluginPicker has a text search input that filters the catalog by
// substring. Verify that typing "compress" narrows the visible list to
// just the Compressor row.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-picker-text-search';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Picker Text Search',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-lead',
				name: 'Lead',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0,
				automation: []
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		buses: [],
		master: { chain: [], volume: 1 }
	};
}

test.describe('PluginPicker text search', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Dev User',
			createdAt: song.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: song.lastEditedAt,
			trackCount: song.tracks.length,
			sectionCount: song.sections.length,
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

	test('typing "compress" narrows the picker to Compressor only', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await page.getByRole('tab', { name: 'Mixer' }).click();
		const strip = page.locator('[data-track-id="track-lead"]');
		await strip
			.locator('[data-section="inserts"]')
			.getByRole('button', { name: 'プラグインを追加' })
			.click();

		const dialog = page.getByRole('dialog', { name: 'プラグインを選択' });
		await expect(dialog).toBeVisible();

		// Filter to built-in to avoid noise from any third-party catalog.
		await dialog.getByRole('button', { name: 'Built-in' }).click();

		// Three core builtins visible (Gain, Filter, Compressor).
		await expect(dialog.getByText('Compressor', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Gain', { exact: true })).toBeVisible();

		// Type into the search input to narrow.
		const search = dialog.getByPlaceholder('検索...');
		await search.fill('compress');

		// Compressor still visible, Gain gone.
		await expect(dialog.getByText('Compressor', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Gain', { exact: true })).toHaveCount(0);

		// Clear search restores both.
		await search.fill('');
		await expect(dialog.getByText('Gain', { exact: true })).toBeVisible();
	});
});
