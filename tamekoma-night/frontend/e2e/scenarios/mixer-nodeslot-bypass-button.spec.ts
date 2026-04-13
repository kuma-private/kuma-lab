// Mixer NodeSlot bypass toggle button.
//
// Seeds a Compressor insert, clicks the dedicated `.bypass` button on
// the NodeSlot (NOT via the menu), and asserts that the songStore
// node.bypass flips true → false → true. This exercises the inline
// bypass toggle UI which is separate from the dropdown menu and from
// the JSON applyPatch toggle-bypass scenario.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-nodeslot-bypass-button';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'NodeSlot Bypass Button',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-pad',
				name: 'Pad',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'node-comp-1',
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

test.describe('Mixer NodeSlot bypass button', () => {
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

	test('clicking the inline bypass button flips node.bypass', async ({
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

		const strip = page.locator('[data-track-id="track-pad"]');
		await expect(strip).toBeVisible();
		const insertSection = strip.locator('[data-section="inserts"]');
		const compressorSlot = insertSection.locator('.slot', { hasText: 'Compressor' });
		await expect(compressorSlot).toBeVisible();

		// `.bypass` is the inline toggle button (title="Bypass", aria-pressed).
		// It is NOT the same as the .slot.bypass class on the wrapper. Locate
		// it via title to disambiguate.
		const bypassBtn = compressorSlot.locator('button.bypass');
		await expect(bypassBtn).toHaveAttribute('aria-pressed', 'false');

		await bypassBtn.click();
		await expect(bypassBtn).toHaveAttribute('aria-pressed', 'true');

		// songStore reflects the change.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const node = snap?.tracks
						.find((t) => t.id === 'track-pad')
						?.chain?.find((n) => n.id === 'node-comp-1');
					return node?.bypass ?? null;
				},
				{ timeout: 3_000 }
			)
			.toBe(true);

		// Click again — flip back to false.
		await bypassBtn.click();
		await expect(bypassBtn).toHaveAttribute('aria-pressed', 'false');
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const node = snap?.tracks
						.find((t) => t.id === 'track-pad')
						?.chain?.find((n) => n.id === 'node-comp-1');
					return node?.bypass ?? null;
				},
				{ timeout: 3_000 }
			)
			.toBe(false);
	});
});
