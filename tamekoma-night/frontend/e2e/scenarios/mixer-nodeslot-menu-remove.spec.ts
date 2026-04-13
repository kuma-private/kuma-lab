// Mixer NodeSlot menu Remove action.
//
// Seeds a track with two Filter inserts, opens the menu on the first
// slot via the `.menu-trigger` button, clicks the "Remove" menu item,
// and asserts the songStore chain shrinks to one entry. This wires up
// NodeSlot.menu → onRemove → ChannelStrip.handleRemove → removeChainNode.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-nodeslot-menu-remove';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'NodeSlot Menu Remove',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-bass',
				name: 'Bass',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'node-filter-1',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' },
						bypass: false,
						params: {}
					},
					{
						id: 'node-filter-2',
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

test.describe('Mixer NodeSlot menu remove', () => {
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

	test('clicking Remove in the slot menu removes that node from the chain', async ({
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

		const strip = page.locator('[data-track-id="track-bass"]');
		await expect(strip).toBeVisible();

		const insertSection = strip.locator('[data-section="inserts"]');
		// Two seeded Filter slots should render.
		await expect(insertSection.locator('.slot', { hasText: 'Filter' })).toHaveCount(2);

		// Open the menu on the FIRST Filter slot.
		const firstSlot = insertSection.locator('.slot', { hasText: 'Filter' }).first();
		await firstSlot.getByRole('button', { name: 'メニュー' }).click();

		// Click Remove inside the rendered menu.
		const menu = firstSlot.getByRole('menu');
		await expect(menu).toBeVisible();
		await menu.getByRole('menuitem', { name: 'Remove' }).click();

		// Chain should now contain only one node — and specifically the second one.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-bass');
					return (t?.chain ?? []).map((n) => n.id);
				},
				{ timeout: 5_000 }
			)
			.toEqual(['node-filter-2']);
	});
});
