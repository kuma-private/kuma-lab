// Stress test: add many automation points to a single lane.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-many-points';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Many Points',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
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

test.describe('Automation many points', () => {
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

	test('adds 24 sequential points (1 per beat for 4 bars at 4/4)', async ({
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

		// 24 points = 6 beats * 4 bars at 480 ticks/beat → ticks 0, 240, 480, ...
		const pointIds: string[] = [];
		for (let i = 0; i < 24; i++) {
			const id = await callSongStore<string>(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				i * 240,
				(i % 8) / 8,
				'linear'
			]);
			pointIds.push(id);
		}

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
			.toBe(24);

		// Verify ticks are sequential.
		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		const ticks = (lane?.points ?? []).map((p) => p.tick).sort((a, b) => a - b);
		expect(ticks[0]).toBe(0);
		expect(ticks[23]).toBe(23 * 240);
	});
});
