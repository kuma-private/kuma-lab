// applyPatch with automation point add op (covers the patch path
// the AI curve apply uses internally).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-applypatch-auto';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'ApplyPatch Auto',
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

test.describe('applyPatch — automation add', () => {
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

	test('AI-style applyPatch with automation lane + 5 points', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Pre-seed the chain node.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);

		// AI returns: 1 lane add + 5 point adds.
		const ops = [
			{
				op: 'add',
				path: '/tracks/track-lead/automation/-',
				value: { nodeId, paramId: 'cutoff', points: [] }
			},
			{
				op: 'add',
				path: `/tracks/track-lead/automation/${nodeId}/cutoff/points/-`,
				value: { id: 'p1', tick: 0, value: 0.0, curve: 'linear' }
			},
			{
				op: 'add',
				path: `/tracks/track-lead/automation/${nodeId}/cutoff/points/-`,
				value: { id: 'p2', tick: 240, value: 0.25, curve: 'linear' }
			},
			{
				op: 'add',
				path: `/tracks/track-lead/automation/${nodeId}/cutoff/points/-`,
				value: { id: 'p3', tick: 480, value: 0.5, curve: 'linear' }
			},
			{
				op: 'add',
				path: `/tracks/track-lead/automation/${nodeId}/cutoff/points/-`,
				value: { id: 'p4', tick: 720, value: 0.75, curve: 'linear' }
			},
			{
				op: 'add',
				path: `/tracks/track-lead/automation/${nodeId}/cutoff/points/-`,
				value: { id: 'p5', tick: 960, value: 1.0, curve: 'linear' }
			}
		];

		await callSongStore(page, 'applyPatch', [ops]);

		const snap = await readCurrentSong(page);
		const lane = snap?.tracks
			.find((t) => t.id === 'track-lead')
			?.automation?.find((a) => a.nodeId === nodeId && a.paramId === 'cutoff');
		expect(lane?.points.length).toBe(5);
		const ticks = (lane?.points ?? []).map((p) => p.tick).sort((a, b) => a - b);
		expect(ticks).toEqual([0, 240, 480, 720, 960]);
	});
});
