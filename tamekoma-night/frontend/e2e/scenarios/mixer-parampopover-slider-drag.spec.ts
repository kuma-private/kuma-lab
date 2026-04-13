// Mixer ParamPopover slider input — filling a range slider on a Filter
// insert updates songStore.currentSong chain params.
//
// Opens a seeded Filter insert's popover via the slot .name button, targets
// the Cutoff range input (aria-label "Cutoff"), sets a new value, and then
// reads window.__cadenza.songStore.currentSong to assert the `cutoff` param
// was written. This exercises the ParamPopover -> ChannelStrip.handleParamChange
// -> songStore.setChainParam path.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-parampopover-slider-drag';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Param Slider Drag',
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
						params: { cutoff: 1000 }
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

test.describe('Mixer ParamPopover slider drag', () => {
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

	test('filling the Cutoff range writes cutoff to songStore chain params', async ({
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

		const strip = page.locator('[data-track-id="track-keys"]');
		const filterSlot = strip
			.locator('[data-section="inserts"]')
			.locator('.slot', { hasText: 'Filter' });
		await filterSlot.locator('button.name').click();

		const popover = page.getByRole('dialog', { name: 'Filter パラメータ' });
		await expect(popover).toBeVisible();

		// Drive the Cutoff slider to a new value via fill() (range inputs emit
		// the same input event we wire ParamPopover.oninput into).
		const cutoff = popover.getByLabel('Cutoff');
		await expect(cutoff).toBeVisible();
		await cutoff.fill('5555');
		// Dispatch an extra input event to be robust vs. range type quirks.
		await cutoff.dispatchEvent('input');

		// Poll songStore until the new value lands through the onParamChange
		// plumbing.
		await expect
			.poll(
				async () => {
					const song = await page.evaluate(() => {
						const w = window as unknown as {
							__cadenza?: { songStore?: { currentSong: unknown } };
						};
						return w.__cadenza?.songStore?.currentSong
							? JSON.parse(JSON.stringify(w.__cadenza.songStore.currentSong))
							: null;
					});
					const node = song?.tracks?.[0]?.chain?.[0];
					return node?.params?.cutoff ?? null;
				},
				{ timeout: 5_000 }
			)
			.toBe(5555);
	});
});
