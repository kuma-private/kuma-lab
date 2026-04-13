// ParamTargetPicker cancel path via Escape.
//
// Verifies the "+ Lane" button in the Automation tab opens the
// ParamTargetPicker dialog and that pressing Escape closes it without
// adding a new lane (pure cancel path — no mutations).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-picker-escape';

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

test.describe('Automation ParamTargetPicker Escape cancel', () => {
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

	test('+ Lane opens picker; Escape closes it without adding a lane', async ({
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

		// Seed a chain node so the picker has at least one candidate row.
		await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBeGreaterThanOrEqual(1);

		// Switch to the Automation tab.
		const automationTab = page.getByRole('tab', { name: 'Automation' });
		await expect(automationTab).toBeVisible();
		await automationTab.click();

		// Sanity: no lanes yet.
		await expect(page.locator('svg.lane-svg')).toHaveCount(0);

		// Click "+ Lane" — dialog appears.
		await page.getByRole('button', { name: '+ Lane' }).click();
		const dialog = page.getByRole('dialog', { name: 'オートメーション対象を選択' });
		await expect(dialog).toBeVisible();

		// Cancel via Escape.
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();

		// Store still has no automation lanes (pure cancel, no mutation).
		const snap = await readCurrentSong(page);
		const track = snap?.tracks.find((t) => t.id === 'track-lead');
		expect(track?.automation ?? []).toEqual([]);
		await expect(page.locator('svg.lane-svg')).toHaveCount(0);
	});
});
