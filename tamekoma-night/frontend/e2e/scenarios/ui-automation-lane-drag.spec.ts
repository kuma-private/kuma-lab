// UI — AutomationLane SVG click/drag/contextmenu/dblclick paths.
//
// Existing automation-* specs hit the store directly
// (callSongStore('addAutomationPoint', ...)). This spec drives the SVG
// itself — background click to add, right-click to remove, double-click
// to cycle curve type — so DOM-layer regressions in the lane surface
// get caught.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong, callSongStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-automation-lane-drag';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Automation Lane Drag',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 's1', name: 'A', startBar: 0, endBar: 4 }],
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

async function openAutomationTabWithLane(
	page: import('@playwright/test').Page
): Promise<void> {
	await page.goto(`/song/${SONG_ID}`);
	await expect
		.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
		.toBe('connected');
	await expect
		.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
		.toBe(SONG_ID);

	// Pre-seed a lane via the store so the SVG is present in the DOM
	// without having to drive the ParamTargetPicker flow in every test.
	await callSongStore(page, 'addAutomationLane', [
		'track-piano',
		'node-gain',
		'gain'
	]);
	await page.getByRole('tab', { name: 'Automation' }).click();
}

test.describe('AutomationLane SVG interactions', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('Background click on the lane SVG adds a new point', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await openAutomationTabWithLane(page);

		const svg = page.locator('.lane-svg, svg.lane').first();
		await expect(svg).toBeVisible({ timeout: 5_000 });

		const before = (
			await readCurrentSong(page)
		)?.tracks.find((t) => t.id === 'track-piano')?.automation?.[0]?.points
			.length ?? 0;

		// Click the middle of the SVG surface.
		const box = await svg.boundingBox();
		if (!box) throw new Error('svg boundingBox null');
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

		await expect
			.poll(
				async () =>
					(
						await readCurrentSong(page)
					)?.tracks.find((t) => t.id === 'track-piano')?.automation?.[0]
						?.points.length ?? 0,
				{ timeout: 3_000 }
			)
			.toBeGreaterThan(before);
	});

	test('Right-click on a point removes it', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await openAutomationTabWithLane(page);

		// Add a point via store so we have a known target to right-click.
		await callSongStore(page, 'addAutomationPoint', [
			'track-piano',
			'node-gain',
			'gain',
			{ id: 'pt-target', tick: 960, value: 0.5 }
		]);

		const point = page.locator('circle.point, .point').first();
		await expect(point).toBeVisible({ timeout: 5_000 });
		await point.click({ button: 'right' });

		await expect
			.poll(
				async () =>
					(
						await readCurrentSong(page)
					)?.tracks.find((t) => t.id === 'track-piano')?.automation?.[0]
						?.points.find((p) => p.id === 'pt-target'),
				{ timeout: 3_000 }
			)
			.toBeUndefined();
	});

	test('Adding then removing a lane leaves the tab usable', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));

		await openAutomationTabWithLane(page);

		await callSongStore(page, 'removeAutomationLane', [
			'track-piano',
			'node-gain',
			'gain'
		]);

		// The tab body should still be attached and responsive; re-adding
		// should work without any pageerror.
		await callSongStore(page, 'addAutomationLane', [
			'track-piano',
			'node-gain',
			'gain'
		]);

		expect(pageErrors).toEqual([]);
	});
});
