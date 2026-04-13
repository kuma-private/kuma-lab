// Mixer NodeSlot menu trigger button.
//
// Seeds a track with an existing Compressor insert, then clicks the
// `.menu-trigger` button on the rendered NodeSlot and verifies the
// dropdown menu (role="menu") becomes visible with a Remove menuitem.
// This covers the menuOpen state toggle path that the existing chain
// scenarios skip (they call songStore methods directly).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-nodeslot-menu-trigger';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'NodeSlot Menu Trigger',
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
				chain: [
					{
						id: 'node-compressor-1',
						kind: 'insert',
						plugin: {
							format: 'builtin',
							uid: 'compressor',
							name: 'Compressor',
							vendor: 'Cadenza'
						},
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

test.describe('Mixer NodeSlot menu trigger', () => {
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

	test('clicking .menu-trigger opens role=menu with a Remove item', async ({
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

		const strip = page.locator('[data-track-id="track-lead"]');
		await expect(strip).toBeVisible();

		// Locate the seeded Compressor slot inside the Inserts section.
		const insertSection = strip.locator('[data-section="inserts"]');
		const compressorSlot = insertSection.locator('.slot', { hasText: 'Compressor' });
		await expect(compressorSlot).toBeVisible();

		// Menu must start hidden.
		await expect(compressorSlot.locator('.menu')).toHaveCount(0);

		// Click the .menu-trigger button (aria-label="メニュー").
		const menuTrigger = compressorSlot.getByRole('button', { name: 'メニュー' });
		await expect(menuTrigger).toBeVisible();
		await menuTrigger.click();

		// The dropdown menu should now be in the DOM.
		const menu = compressorSlot.getByRole('menu');
		await expect(menu).toBeVisible();
		await expect(menu.getByRole('menuitem', { name: 'Remove' })).toBeVisible();
		await expect(menu.getByRole('menuitem', { name: 'Open Params' })).toBeVisible();
	});
});
