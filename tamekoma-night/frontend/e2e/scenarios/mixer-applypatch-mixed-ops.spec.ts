// applyPatch with mixed op types in the same batch.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixed-ops';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mixed Ops',
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
				chain: [
					{
						id: 'pre-existing',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' },
						bypass: false,
						params: { gainDb: 0 }
					}
				],
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

test.describe('Mixer applyPatch mixed ops', () => {
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

	test('add + replace + remove ops in one applyPatch batch', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					return snap?.tracks.find((t) => t.id === 'track-lead')?.chain?.length ?? 0;
				},
				{ timeout: 3_000 }
			)
			.toBe(1);

		const ops = [
			// 1. Replace volume.
			{ op: 'replace', path: '/tracks/track-lead/volume', value: -4 },
			// 2. Add a new svf insert.
			{
				op: 'add',
				path: '/tracks/track-lead/chain/-',
				value: {
					id: 'svf-1',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' },
					bypass: false,
					params: { cutoff: 1500 }
				}
			},
			// 3. Remove the pre-existing gain insert.
			{ op: 'remove', path: '/tracks/track-lead/chain/pre-existing' }
		];

		await callSongStore(page, 'applyPatch', [ops]);

		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| {
					volume?: number;
					chain?: Array<{ id: string; plugin?: { uid?: string } }>;
			  }
			| undefined;
		expect(t?.volume).toBe(-4);
		expect(t?.chain?.length).toBe(1);
		expect(t?.chain?.[0]?.id).toBe('svf-1');
		expect(t?.chain?.[0]?.plugin?.uid).toBe('svf');
	});
});
