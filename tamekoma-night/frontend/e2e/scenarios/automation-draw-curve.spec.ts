// Automation tab — manual curve drawing.
//
// 1. Pre-seed a chain node on the first track via the songStore (exposed
//    via window.__cadenza).
// 2. Open the Automation tab.
// 3. Click "+ Lane", pick the Filter Cutoff param.
// 4. Click on the lane SVG to add a point.
// 5. Verify the songStore has the new AutomationPoint.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-draw';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation Draw',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 8 }],
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

test.describe('Automation draw curve', () => {
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

	test('adds a lane and a point on the SVG', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();

		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait for the song to fully load before mutating the store.
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Seed a Filter insert on the lead track via the store API so the
		// Automation tab has something automatable.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		expect(nodeId).toBeTruthy();

		// Wait for the chain node to land so the picker has the Cutoff row.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBeGreaterThanOrEqual(1);

		const automationTab = page.getByRole('tab', { name: 'Automation' });
		await expect(automationTab).toBeVisible();
		await automationTab.click();

		// "+ Lane" button opens the ParamTargetPicker.
		await page.getByRole('button', { name: '+ Lane' }).click();
		const paramDialog = page.getByRole('dialog', { name: 'オートメーション対象を選択' });
		await expect(paramDialog).toBeVisible();

		// Pick the "Cutoff" row.
		await paramDialog.getByText('Cutoff').click();
		await expect(paramDialog).toBeHidden();

		// The lane SVG should now render. Click somewhere in the middle.
		const svg = page.locator('svg.lane-svg').first();
		await expect(svg).toBeVisible();
		const box = await svg.boundingBox();
		expect(box).not.toBeNull();
		if (!box) return;
		await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4);

		// songStore now has at least one AutomationPoint on the Cutoff lane.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const track = snap?.tracks.find((t) => t.id === 'track-lead');
					const lane = track?.automation?.find(
						(a) => a.nodeId === nodeId && a.paramId === 'cutoff'
					);
					return lane?.points.length ?? 0;
				},
				{ timeout: 5_000 }
			)
			.toBeGreaterThanOrEqual(1);

		await page.screenshot({ path: 'e2e/screenshots/automation-draw-curve.png', fullPage: true });
	});
});
