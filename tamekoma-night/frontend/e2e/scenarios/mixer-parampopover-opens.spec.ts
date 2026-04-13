// Mixer ParamPopover opens via slot name button.
//
// Seeds a Filter insert, clicks the slot's `.name` button, and asserts
// the ParamPopover dialog (role="dialog", aria-label="Filter パラメータ")
// becomes visible. This covers the popoverNode binding path on
// ChannelStrip and the descriptor-driven render in ParamPopover.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-parampopover-opens';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ParamPopover Opens',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-keys',
				name: 'Keys',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'node-filter-keys',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' },
						bypass: false,
						params: {}
					}
				],
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

test.describe('Mixer ParamPopover opens', () => {
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

	test('clicking the slot name button opens the ParamPopover dialog', async ({
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

		const strip = page.locator('[data-track-id="track-keys"]');
		await expect(strip).toBeVisible();

		const filterSlot = strip
			.locator('[data-section="inserts"]')
			.locator('.slot', { hasText: 'Filter' });
		await expect(filterSlot).toBeVisible();

		// Popover must NOT be visible until clicked.
		await expect(page.getByRole('dialog', { name: 'Filter パラメータ' })).toHaveCount(0);

		// Click the .name button (the same button label as the plugin name).
		const nameBtn = filterSlot.locator('button.name');
		await expect(nameBtn).toBeVisible();
		await nameBtn.click();

		// ParamPopover dialog should now be visible.
		const popover = page.getByRole('dialog', { name: 'Filter パラメータ' });
		await expect(popover).toBeVisible();

		// Pressing Escape closes the popover (covers the keydown handler).
		await page.keyboard.press('Escape');
		await expect(popover).toBeHidden();
	});
});
