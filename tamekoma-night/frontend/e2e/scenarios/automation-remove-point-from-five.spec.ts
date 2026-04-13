// removeAutomationPoint(id) on a lane with 5 points — only the matching
// point is dropped, the other 4 are untouched (values, curves, ids all
// preserved). Complements automation-remove-point-single which covers the
// "only point" edge case.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-remove-from-five';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Remove One of Five',
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

test.describe('Automation remove one point from five', () => {
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

	test('removing by id drops only the matching point, keeping the other 4', async ({
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
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);

		// Add 5 points with distinct ticks + curves.
		const seeds: Array<{ tick: number; value: number; curve: string }> = [
			{ tick: 0, value: 0.1, curve: 'linear' },
			{ tick: 240, value: 0.3, curve: 'hold' },
			{ tick: 480, value: 0.5, curve: 'ease-in' },
			{ tick: 720, value: 0.7, curve: 'ease-out' },
			{ tick: 960, value: 0.9, curve: 'linear' }
		];
		const ids: string[] = [];
		for (const s of seeds) {
			const pid = await callSongStore<string>(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				s.tick,
				s.value,
				s.curve
			]);
			ids.push(pid);
		}
		expect(ids.length).toBe(5);

		// Sanity: lane has exactly 5 points.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const lane = snap?.tracks
						.find((t) => t.id === 'track-lead')
						?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
					return lane?.points.length ?? -1;
				},
				{ timeout: 3_000 }
			)
			.toBe(5);

		// Remove the middle one (tick=480).
		const targetId = ids[2];
		await callSongStore(page, 'removeAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			targetId
		]);

		// Lane now has 4 points; the target is gone, others are identical.
		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane?.points.length).toBe(4);
		const pts = lane?.points ?? [];

		// Target is absent.
		expect(pts.find((p) => p.id === targetId)).toBeUndefined();
		expect(pts.find((p) => p.tick === 480)).toBeUndefined();

		// All other 4 are present and untouched — same id/tick/value/curve.
		for (let i = 0; i < seeds.length; i++) {
			if (i === 2) continue;
			const expected = seeds[i];
			const p = pts.find((x) => x.id === ids[i]);
			expect(p).toBeTruthy();
			expect(p?.tick).toBe(expected.tick);
			expect(p?.value).toBeCloseTo(expected.value, 5);
			expect(p?.curve).toBe(expected.curve);
		}
	});
});
