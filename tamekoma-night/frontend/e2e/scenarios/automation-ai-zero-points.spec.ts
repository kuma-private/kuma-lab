// AI curve suggest returns an empty (0-point) curve.
//
// The Apply flow currently calls replaceAutomationRange with an empty
// newPoints array over [preview.startTick, preview.endTick). This test
// documents the observed behavior: Apply with 0 preview points is
// equivalent to clearing any existing in-range points on the lane.
//
// We pre-seed one in-range and one out-of-range point so we can assert
// both the clear and the preserve behaviors.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-ai-zero';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation AI Zero',
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

test.describe('Automation AI zero-point curve', () => {
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

		// Mock /api/automation/suggest with an EMPTY curve.
		await page.route('**/api/automation/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: '空のカーブ',
					points: []
				})
			})
		);
	});

	test('Apply with 0 preview points clears in-range, preserves out-of-range', async ({
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

		// Add the Cutoff lane via the UI.
		await page.getByRole('button', { name: '+ Lane' }).click();
		const paramDialog = page.getByRole('dialog', { name: 'オートメーション対象を選択' });
		await paramDialog.getByText('Cutoff').click();
		await expect(paramDialog).toBeHidden();

		// Seed a point inside the section range (will be cleared by Apply)
		// and one outside (tick >= 1_000_000, preserved).
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			120,
			0.4,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			1_000_000,
			0.6,
			'linear'
		]);

		// Open AI popover, submit.
		await page.getByRole('button', { name: 'AI でカーブを生成' }).click();
		const aiPopover = page.getByRole('dialog', { name: 'AI カーブ生成' });
		await expect(aiPopover).toBeVisible();
		await aiPopover.locator('textarea.prompt-input').fill('空のカーブ');
		await aiPopover.getByRole('button', { name: 'Generate' }).click();

		// With 0 points, no preview-path is rendered. Give the suggest
		// handler a beat to resolve, then click Apply.
		await expect(aiPopover.getByRole('button', { name: 'Apply' })).toBeVisible({
			timeout: 5_000
		});
		await aiPopover.getByRole('button', { name: 'Apply' }).click();

		// Observed behavior: in-range point gone, out-of-range preserved.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const lane = snap?.tracks
						.find((t) => t.id === 'track-lead')
						?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
					return lane?.points.map((p) => p.tick).sort((a, b) => a - b) ?? [];
				},
				{ timeout: 5_000 }
			)
			.toEqual([1_000_000]);

		// Lane itself still exists.
		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane).toBeTruthy();
	});
});
