// Large applyPatch batch scenario.
//
// Drives applyPatch with 30+ ops in one call to mimic an AI mixer
// chat response that overhauls a track in one shot. Verifies the
// store + bridge handle a single big batch correctly.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-large-batch';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Large Batch',
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

test.describe('Mixer large mutation batch', () => {
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

	test('applyPatch with 30 ops applies all of them atomically', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Build a big batch: replace volume + pan + mute + solo + add 10
		// chain nodes + add 10 sends to a fresh bus.
		const ops: Array<{ op: string; path: string; value?: unknown }> = [];
		ops.push({
			op: 'replace',
			path: '/tracks/track-lead/volumeDb',
			value: -3
		});
		ops.push({ op: 'replace', path: '/tracks/track-lead/pan', value: 0.2 });
		ops.push({ op: 'replace', path: '/tracks/track-lead/mute', value: false });
		ops.push({ op: 'replace', path: '/tracks/track-lead/solo', value: false });

		// Add a bus first.
		const busId = 'bus-batch';
		ops.push({
			op: 'add',
			path: '/buses/-',
			value: {
				id: busId,
				name: 'Batch Bus',
				chain: [],
				sends: [],
				volume: 0.8,
				pan: 0
			}
		});

		// 10 inserts.
		for (let i = 0; i < 10; i++) {
			ops.push({
				op: 'add',
				path: '/tracks/track-lead/chain/-',
				value: {
					id: `n-${i}`,
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' },
					bypass: false,
					params: { gainDb: -i }
				}
			});
		}

		// 10 sends to the bus.
		for (let i = 0; i < 10; i++) {
			ops.push({
				op: 'add',
				path: '/tracks/track-lead/sends/-',
				value: {
					id: `s-${i}`,
					destBusId: busId,
					level: i / 10,
					pre: false
				}
			});
		}

		expect(ops.length).toBe(25);

		await callSongStore(page, 'applyPatch', [ops]);

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead') as
						| {
								chain?: Array<{ id: string }>;
								sends?: Array<{ id: string }>;
								volume?: number;
								pan?: number;
						  }
						| undefined;
					const buses = (snap as { buses?: Array<{ id: string }> } | null)?.buses;
					return {
						chainLen: t?.chain?.length ?? 0,
						sendsLen: t?.sends?.length ?? 0,
						volume: t?.volume ?? null,
						pan: t?.pan ?? null,
						busesLen: buses?.length ?? 0
					};
				},
				{ timeout: 5_000 }
			)
			.toMatchObject({ chainLen: 10, sendsLen: 10, volume: -3, pan: 0.2, busesLen: 1 });
	});
});
