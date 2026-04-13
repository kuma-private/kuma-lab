// Automation AI curve — 5-point linear sweep.
//
// Extends automation-ai-curve (which exercises the 3-point case and the
// dashed-preview rendering) by forcing the suggest endpoint to return a
// 5-point linear curve. Asserts that Apply lands all 5 points on the lane
// and that the stored points are sorted ascending by tick (the store's
// replaceAutomationRange contract).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-ai-linear-5';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'AI Linear 5',
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

test.describe('Automation AI 5-point linear curve', () => {
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

		// 5-point linear curve from 0.0 → 1.0 at ticks 0/240/480/720/960.
		// Intentionally return the ticks in the suggest payload out-of-order
		// so we can prove the stored lane is sorted ascending.
		await page.route('**/api/automation/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: '5-point linear sweep',
					points: [
						{ tick: 960, value: 1.0, curve: 'linear' },
						{ tick: 0, value: 0.0, curve: 'linear' },
						{ tick: 480, value: 0.5, curve: 'linear' },
						{ tick: 720, value: 0.75, curve: 'linear' },
						{ tick: 240, value: 0.25, curve: 'linear' }
					]
				})
			})
		);
	});

	test('Apply lands 5 points and they are sorted ascending by tick', async ({
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

		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		expect(nodeId).toBeTruthy();

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

		await page.getByRole('button', { name: '+ Lane' }).click();
		const paramDialog = page.getByRole('dialog', { name: 'オートメーション対象を選択' });
		await paramDialog.getByText('Cutoff').click();
		await expect(paramDialog).toBeHidden();

		await page.getByRole('button', { name: 'AI でカーブを生成' }).click();
		const aiPopover = page.getByRole('dialog', { name: 'AI カーブ生成' });
		await expect(aiPopover).toBeVisible();

		await aiPopover.locator('textarea.prompt-input').fill('linear sweep');
		await aiPopover.getByRole('button', { name: 'Generate' }).click();

		// Wait for the dashed preview to render so we know the suggest
		// response landed in the preview store.
		const previewPath = page.locator('svg.lane-svg path.preview-path').first();
		await expect(previewPath).toBeVisible({ timeout: 5_000 });

		await aiPopover.getByRole('button', { name: 'Apply' }).click();

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const lane = snap?.tracks
						.find((t) => t.id === 'track-lead')
						?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
					return lane?.points.length ?? 0;
				},
				{ timeout: 5_000 }
			)
			.toBe(5);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const ticks = (lane?.points ?? []).map((p) => p.tick);
		const sorted = [...ticks].sort((a, b) => a - b);
		expect(ticks).toEqual(sorted);
		expect(ticks).toEqual([0, 240, 480, 720, 960]);

		// Values should also line up with the linear ramp.
		const byTick = new Map((lane?.points ?? []).map((p) => [p.tick, p.value]));
		expect(byTick.get(0)).toBe(0);
		expect(byTick.get(240)).toBe(0.25);
		expect(byTick.get(480)).toBe(0.5);
		expect(byTick.get(720)).toBe(0.75);
		expect(byTick.get(960)).toBe(1);
	});
});
