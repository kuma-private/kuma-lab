// Multi-lane automation scenario.
//
// Same track, two automation lanes on different params of the same insert,
// each with multiple points. Verifies the lanes don't interfere.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-automation-multi-lane';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Multi Lane',
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

test.describe('Automation multi-lane', () => {
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

	test('cutoff and resonance lanes on the same SVF stay independent', async ({
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

		// Two lanes on the same node.
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'resonance']);

		// 3 points each.
		for (const tick of [0, 240, 480]) {
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'cutoff',
				tick,
				tick / 480,
				'linear'
			]);
		}
		for (const tick of [0, 240, 480]) {
			await callSongStore(page, 'addAutomationPoint', [
				'track-lead',
				nodeId,
				'resonance',
				tick,
				1 - tick / 480,
				'linear'
			]);
		}

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead');
					return {
						laneCount: t?.automation?.length ?? 0,
						cutoffPoints:
							t?.automation?.find((a) => a.paramId === 'cutoff')?.points.length ?? 0,
						resPoints:
							t?.automation?.find((a) => a.paramId === 'resonance')?.points.length ?? 0
					};
				},
				{ timeout: 3_000 }
			)
			.toMatchObject({ laneCount: 2, cutoffPoints: 3, resPoints: 3 });

		// Remove just the cutoff lane and verify resonance survives.
		await callSongStore(page, 'removeAutomationLane', [
			'track-lead',
			nodeId,
			'cutoff'
		]);
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead');
					return {
						laneCount: t?.automation?.length ?? 0,
						hasCutoff: !!t?.automation?.find((a) => a.paramId === 'cutoff'),
						hasRes: !!t?.automation?.find((a) => a.paramId === 'resonance')
					};
				},
				{ timeout: 3_000 }
			)
			.toMatchObject({ laneCount: 1, hasCutoff: false, hasRes: true });
	});
});
