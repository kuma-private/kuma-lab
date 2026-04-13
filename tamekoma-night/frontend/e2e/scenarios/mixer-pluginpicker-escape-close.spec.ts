// Mixer PluginPicker Escape-to-close.
//
// Opens the PluginPicker via the empty insert slot, then presses
// Escape and asserts the picker dialog is hidden. Covers the
// handleKeydown branch in PluginPicker.svelte (no existing scenario
// exercises the cancel/close path — only the format filter and
// search filter inputs).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-pluginpicker-escape-close';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Picker Escape',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-drums',
				name: 'Drums',
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

test.describe('Mixer PluginPicker escape close', () => {
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

	test('pressing Escape after opening the picker hides the dialog and adds nothing', async ({
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

		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		await expect(mixerTab).toBeVisible({ timeout: 10_000 });
		await mixerTab.click();

		const strip = page.locator('[data-track-id="track-drums"]');
		await expect(strip).toBeVisible();

		// Open the PluginPicker via the empty Inserts slot.
		const insertAddSlot = strip
			.locator('[data-section="inserts"]')
			.getByRole('button', { name: 'プラグインを追加' });
		await insertAddSlot.click();

		const pickerDialog = page.getByRole('dialog', { name: 'プラグインを選択' });
		await expect(pickerDialog).toBeVisible();

		// Press Escape — handleKeydown branch should call onClose.
		await page.keyboard.press('Escape');
		await expect(pickerDialog).toBeHidden();

		// Sanity check: chain remains empty (nothing was picked).
		const snap = await readCurrentSong(page);
		const chain = snap?.tracks.find((t) => t.id === 'track-drums')?.chain ?? [];
		expect(chain).toHaveLength(0);
	});
});
