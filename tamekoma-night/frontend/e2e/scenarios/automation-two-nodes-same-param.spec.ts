// Two chain nodes on the SAME track, each with a lane on the SAME paramId
// (`cutoff`), must coexist independently. The lane key is (nodeId, paramId),
// so `nodeId1+cutoff` and `nodeId2+cutoff` are distinct.
//
// Second half: removing an UNRELATED track must not touch either lane —
// locks cross-track isolation for removeTrack (not just mutation methods
// covered by automation-multi-track-isolation).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-auto-two-nodes-cutoff';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Two Nodes Same Param',
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
			},
			{
				id: 'track-pad',
				name: 'Pad',
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

test.describe('Automation two chain nodes, same param, same track', () => {
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

	test('two filter nodes, each with a cutoff lane, survive removeTrack of a sibling track', async ({
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

		// Two Filter nodes on track-lead.
		const nodeA = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		const nodeB = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		expect(nodeA).toBeTruthy();
		expect(nodeB).toBeTruthy();
		expect(nodeA).not.toBe(nodeB);

		// Lane on nodeA+cutoff, lane on nodeB+cutoff.
		expect(
			await callSongStore<boolean>(page, 'addAutomationLane', ['track-lead', nodeA, 'cutoff'])
		).toBe(true);
		expect(
			await callSongStore<boolean>(page, 'addAutomationLane', ['track-lead', nodeB, 'cutoff'])
		).toBe(true);

		// Seed distinct values so we can tell them apart.
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeA,
			'cutoff',
			0,
			0.2,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeA,
			'cutoff',
			240,
			0.25,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeB,
			'cutoff',
			0,
			0.85,
			'linear'
		]);

		// Before any removeTrack, assert the two lanes coexist distinctly.
		{
			const snap = await readCurrentSong(page);
			const track = snap?.tracks.find((t) => t.id === 'track-lead');
			const lanes = track?.automation ?? [];
			expect(lanes.length).toBe(2);
			const laneA = lanes.find((l) => l.nodeId === nodeA && l.paramId === 'cutoff');
			const laneB = lanes.find((l) => l.nodeId === nodeB && l.paramId === 'cutoff');
			expect(laneA?.points.length).toBe(2);
			expect(laneB?.points.length).toBe(1);
			expect(laneA?.points[0].value).toBe(0.2);
			expect(laneA?.points[1].value).toBe(0.25);
			expect(laneB?.points[0].value).toBe(0.85);
		}

		// Now removeTrack the unrelated sibling (track-pad). Both lead
		// lanes must be untouched (cross-track isolation).
		await callSongStore(page, 'removeTrack', ['track-pad']);

		const snap = await readCurrentSong(page);
		expect(snap?.tracks.length).toBe(1);
		expect(snap?.tracks[0].id).toBe('track-lead');
		const lanes = snap?.tracks[0].automation ?? [];
		expect(lanes.length).toBe(2);
		const laneA = lanes.find((l) => l.nodeId === nodeA && l.paramId === 'cutoff');
		const laneB = lanes.find((l) => l.nodeId === nodeB && l.paramId === 'cutoff');
		expect(laneA).toBeTruthy();
		expect(laneB).toBeTruthy();
		expect(laneA?.points.length).toBe(2);
		expect(laneB?.points.length).toBe(1);
		expect(laneA?.points[0].value).toBe(0.2);
		expect(laneB?.points[0].value).toBe(0.85);
	});
});
