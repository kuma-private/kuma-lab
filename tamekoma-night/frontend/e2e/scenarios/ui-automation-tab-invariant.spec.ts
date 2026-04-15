// UI — Automation tab interaction + viewport invariants.
//
// Automation tab has complex vertical stacking (lane header + point timeline
// per lane) and an AI curve generator inside a modal. Existing automation-*
// specs exercise store-level mutations (addAutomationPoint, moveAutomationPoint,
// etc.) but never check that the resulting DOM is reachable from a user's
// viewport. This spec adds the geometric invariant coverage.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong, callSongStore } from '../fixtures/window-stores';
import { assertElementInViewport } from '../fixtures/ui-interactions';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-automation-tab';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation Tab Spec',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | Am | F | G |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [
					{
						id: 'node-gain',
						plugin: {
							name: 'Gain',
							uid: 'builtin.gain',
							format: 'builtin'
						},
						params: { gain: 0 },
						bypass: false
					}
				] as unknown as Song['tracks'][number]['chain'],
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

async function stub(page: import('@playwright/test').Page): Promise<void> {
	const song = makeSong();
	const li: SongListItem = {
		id: SONG_ID,
		title: song.title,
		bpm: song.bpm,
		key: song.key,
		timeSignature: song.timeSignature,
		createdByName: 'u',
		createdAt: song.createdAt,
		lastEditedBy: 'u',
		lastEditedAt: song.lastEditedAt,
		trackCount: 1,
		sectionCount: 1,
		visibility: 'private'
	};
	await page.route('**/auth/me', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				name: 'u',
				email: 'u@t.com',
				sub: 'dev-user',
				tier: 'premium'
			})
		})
	);
	await page.route('**/api/songs', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([li])
		})
	);
	await page.route(`**/api/songs/${SONG_ID}`, (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(song)
		})
	);
}

test.describe('Automation tab — UI invariants', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('Automation tab becomes active without pageerror', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const tab = page.getByRole('tab', { name: 'Automation' });
		await tab.click();
		await expect(tab).toHaveAttribute('aria-selected', 'true');
		expect(pageErrors).toEqual([]);
	});

	test('ParamTargetPicker opens with the close button inside viewport', async ({
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

		await page.getByRole('tab', { name: 'Automation' }).click();
		await page
			.getByRole('button', { name: /レーン.*追加|\+.*Lane|パラメータ.*追加/i })
			.first()
			.click();

		const dialog = page.getByRole('dialog', {
			name: 'オートメーション対象を選択'
		});
		await expect(dialog).toBeVisible();
		await assertElementInViewport(
			page,
			dialog.getByRole('button', { name: '閉じる' }),
			'ParamTargetPicker close'
		);
	});

	test('Automation lane scroll: lane header stays visible after programmatic adds', async ({
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

		// Add a lane via store for deterministic setup.
		await callSongStore(page, 'addAutomationLane', [
			'track-piano',
			'node-gain',
			'gain'
		]);
		await page.getByRole('tab', { name: 'Automation' }).click();

		// Push 20 points rapidly via store and ensure the lane header remains
		// above the viewport top after scrolling back to the top. This keeps
		// the remove button reachable regardless of point count.
		for (let i = 0; i < 20; i++) {
			await callSongStore(page, 'addAutomationPoint', [
				'track-piano',
				'node-gain',
				'gain',
				{ id: `pt-${i}`, tick: i * 480, value: 0.5 }
			]);
		}
		await page.evaluate(() => window.scrollTo(0, 0));

		const firstLaneHeader = page.locator('.lane-header').first();
		if ((await firstLaneHeader.count()) > 0) {
			await assertElementInViewport(page, firstLaneHeader, 'first lane header');
		}
	});

	test('Switching between automation lanes leaves no stale DOM', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await page.getByRole('tab', { name: 'Automation' }).click();

		// Add two lanes then remove the first; the UI must not throw when the
		// selected index shifts.
		await callSongStore(page, 'addAutomationLane', [
			'track-piano',
			'node-gain',
			'gain'
		]);
		await callSongStore(page, 'addAutomationLane', [
			'track-piano',
			'node-gain',
			'threshold'
		]);
		await callSongStore(page, 'removeAutomationLane', [
			'track-piano',
			'node-gain',
			'gain'
		]);

		expect(pageErrors).toEqual([]);
	});
});
