// Two automation lanes on the SAME chain node but for DIFFERENT params.
//
// `automation-multi-lane` covers multiple lanes in general; this test
// narrows to the "two params on the same nodeId" case to lock in the
// composite (nodeId, paramId) lane key and to make sure adding/removing
// one lane does not touch the sibling on the same node.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-same-node-two-params';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Same Node Two Params',
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

test.describe('Automation two params on same node', () => {
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

	test('cutoff + resonance on the same Filter node coexist and remove in isolation', async ({
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

		// Add two lanes for different params on the same nodeId.
		const a = await callSongStore<boolean>(page, 'addAutomationLane', [
			'track-lead',
			nodeId,
			'cutoff'
		]);
		const b = await callSongStore<boolean>(page, 'addAutomationLane', [
			'track-lead',
			nodeId,
			'resonance'
		]);
		expect(a).toBe(true);
		expect(b).toBe(true);

		// Seed a point in each so we can distinguish them.
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			120,
			0.3,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'resonance',
			120,
			0.7,
			'linear'
		]);

		// Both lanes coexist on the same nodeId.
		{
			const snap = await readCurrentSong(page);
			const track = snap?.tracks.find((t) => t.id === 'track-lead');
			const lanes = track?.automation ?? [];
			expect(lanes.length).toBe(2);
			const onThisNode = lanes.filter((l) => l.nodeId === nodeId);
			expect(onThisNode.length).toBe(2);
			const params = onThisNode.map((l) => l.paramId).sort();
			expect(params).toEqual(['cutoff', 'resonance']);
			// Each lane has exactly one point with its seeded value.
			const cutoff = onThisNode.find((l) => l.paramId === 'cutoff');
			const reso = onThisNode.find((l) => l.paramId === 'resonance');
			expect(cutoff?.points.length).toBe(1);
			expect(reso?.points.length).toBe(1);
			expect(cutoff?.points[0].value).toBe(0.3);
			expect(reso?.points[0].value).toBe(0.7);
		}

		// Removing only the cutoff lane leaves resonance intact.
		await callSongStore(page, 'removeAutomationLane', ['track-lead', nodeId, 'cutoff']);
		{
			const snap = await readCurrentSong(page);
			const track = snap?.tracks.find((t) => t.id === 'track-lead');
			const lanes = track?.automation ?? [];
			expect(lanes.length).toBe(1);
			expect(lanes[0].nodeId).toBe(nodeId);
			expect(lanes[0].paramId).toBe('resonance');
			expect(lanes[0].points[0].value).toBe(0.7);
		}
	});
});
