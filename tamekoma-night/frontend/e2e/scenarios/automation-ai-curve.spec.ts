// Automation tab — AI-generated curve flow.
//
// 1. Seed a Filter insert on the lead track via window.__cadenza.songStore.
// 2. Open Automation tab, add a Cutoff lane.
// 3. Click the AI button on the lane → popover opens.
// 4. Fill in a prompt, click Generate. Mocked /api/automation/suggest
//    returns a 3-point preview curve.
// 5. Verify the dashed preview renders on the SVG.
// 6. Click Apply → songStore has the committed points.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-ai';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation AI',
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

test.describe('Automation AI curve', () => {
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

		// Mock /api/automation/suggest with a 3-point sweep from 0 → 1.
		await page.route('**/api/automation/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: '0 から MAX へスイープ',
					points: [
						{ tick: 0, value: 0, curve: 'linear' },
						{ tick: 960, value: 0.5, curve: 'linear' },
						{ tick: 1920, value: 1, curve: 'linear' }
					]
				})
			})
		);
	});

	test('generates a preview then applies it to the lane', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();

		await page.goto(`/song/${SONG_ID}`);

		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Wait for the song to fully load before mutating the store.
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Seed a Filter insert on the lead track so the Automation tab has a
		// parameter to automate.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		expect(nodeId).toBeTruthy();

		// Wait for the chain node to actually land in the store before
		// clicking through the UI — otherwise the param picker can render
		// before the node exists, causing intermittent flakes.
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

		// Add the Cutoff lane.
		await page.getByRole('button', { name: '+ Lane' }).click();
		const paramDialog = page.getByRole('dialog', { name: 'オートメーション対象を選択' });
		await paramDialog.getByText('Cutoff').click();
		await expect(paramDialog).toBeHidden();

		// Click the AI button to open the popover.
		await page.getByRole('button', { name: 'AI でカーブを生成' }).click();
		const aiPopover = page.getByRole('dialog', { name: 'AI カーブ生成' });
		await expect(aiPopover).toBeVisible();

		// Fill prompt and click Generate.
		await aiPopover.locator('textarea.prompt-input').fill('0 から MAX へスイープ');
		await aiPopover.getByRole('button', { name: 'Generate' }).click();

		// Dashed preview path should render inside the lane SVG.
		const previewPath = page.locator('svg.lane-svg path.preview-path').first();
		await expect(previewPath).toBeVisible({ timeout: 5_000 });

		// Click Apply.
		await aiPopover.getByRole('button', { name: 'Apply' }).click();

		// songStore now has the applied points.
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
			.toBeGreaterThanOrEqual(3);

		await page.screenshot({ path: 'e2e/screenshots/automation-ai-curve.png', fullPage: true });
	});
});
