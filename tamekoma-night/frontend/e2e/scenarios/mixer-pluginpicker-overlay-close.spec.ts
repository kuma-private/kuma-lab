// Mixer PluginPicker — clicking the dimmed overlay backdrop closes the
// picker without picking anything.
//
// PluginPicker's `.overlay` wrapper has an onclick handler
// (handleOverlayClick) that calls onClose() when the click target is the
// overlay itself (not the inner .picker dialog). No existing pluginpicker
// spec exercises this path — previous tests cover Escape, search, filter
// tabs, and row-pick. Note: the arrow-key + Enter keyboard navigation
// path named in the round plan does not actually exist in PluginPicker
// today (only Escape is handled), so this spec substitutes the overlay
// close interaction within the same component family.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-pluginpicker-overlay-close';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'PluginPicker Overlay Close',
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

test.describe('Mixer PluginPicker overlay close', () => {
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

	test('clicking the overlay backdrop closes the picker; inner dialog click does not', async ({
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

		// Clicking inside the inner .picker dialog should NOT close it —
		// handleOverlayClick only fires when event.target === currentTarget
		// (the overlay element). Click the dialog header as a sanity check.
		const header = dialog.locator('.picker-head');
		await header.click();
		await expect(dialog).toBeVisible();

		// Now click the outer overlay backdrop. We target coordinates in
		// the top-left corner of the viewport, which is covered by the
		// fixed-position overlay but outside the centered .picker box.
		await page.mouse.click(10, 10);

		// Picker closes.
		await expect(dialog).toBeHidden();

		// Store side: no chain node was added since nothing was picked.
		const snap = await readCurrentSong(page);
		const chain = snap?.tracks.find((t) => t.id === 'track-lead')?.chain ?? [];
		expect(chain).toHaveLength(0);
	});
});
