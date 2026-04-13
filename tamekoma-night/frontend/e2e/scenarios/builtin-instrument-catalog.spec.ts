// Cycle through every built-in instrument the bridge exposes and verify
// setTrackInstrument lands each one on the track. Catches any new built-in
// being added on the Rust side without the frontend store understanding
// the format ref.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-builtin-cycle';

const BUILTINS = [
	{ uid: 'sine', name: 'Sine' },
	{ uid: 'supersaw', name: 'SuperSaw' },
	{ uid: 'subbass', name: 'SubBass' },
	{ uid: 'drumkit', name: 'DrumKit' }
];

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Builtin Cycle',
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

test.describe('Builtin instrument cycle', () => {
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

	test('setTrackInstrument swaps through every builtin uid', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		for (const inst of BUILTINS) {
			await callSongStore(page, 'setTrackInstrument', [
				'track-lead',
				{ format: 'builtin', uid: inst.uid, name: inst.name, vendor: 'Cadenza' }
			]);
			const snap = await readCurrentSong(page);
			const t = snap?.tracks.find((x) => x.id === 'track-lead') as
				| { instrumentPlugin?: { uid?: string; name?: string } }
				| undefined;
			expect(t?.instrumentPlugin?.uid).toBe(inst.uid);
			expect(t?.instrumentPlugin?.name).toBe(inst.name);
		}
	});
});
