// PluginPicker format filter buttons (All / VST3 / CLAP / Built-in).
// In the e2e harness no third-party plugins are installed so VST3 and
// CLAP tabs should show an empty state, while Built-in shows at least
// the three core effects.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-picker-format';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Picker Format',
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

test.describe('PluginPicker format filter', () => {
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

	test('Built-in tab shows the three core effects, VST3/CLAP tabs are empty', async ({
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

		// Built-in: 3 core effects visible.
		await dialog.getByRole('button', { name: 'Built-in' }).click();
		await expect(dialog.getByText('Gain', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Filter', { exact: true })).toBeVisible();
		await expect(dialog.getByText('Compressor', { exact: true })).toBeVisible();

		// VST3: built-in rows must NOT appear (filtered out).
		await dialog.getByRole('button', { name: 'VST3' }).click();
		await expect(dialog.getByText('Gain', { exact: true })).toHaveCount(0);
		await expect(dialog.getByText('Filter', { exact: true })).toHaveCount(0);

		// CLAP: same — no built-ins leaking.
		await dialog.getByRole('button', { name: 'CLAP' }).click();
		await expect(dialog.getByText('Gain', { exact: true })).toHaveCount(0);
	});
});
