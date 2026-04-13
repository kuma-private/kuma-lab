// applyPatch with a path that does not resolve in the local store should
// be a silent no-op, not a crash. Real-world trigger: AI mixer chat
// returning a path that targets a deleted track id.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-applypatch-invalid';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Invalid Path',
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
				volume: -3,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0.1,
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

test.describe('applyPatch — unresolvable path is a no-op', () => {
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

	test('patch with bad track id leaves valid sibling ops applied', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Mixed batch: one valid op (real track), one bogus (nonexistent track).
		await callSongStore(page, 'applyPatch', [
			[
				{ op: 'replace', path: '/tracks/track-lead/pan', value: 0.5 },
				{ op: 'replace', path: '/tracks/track-ghost/volumeDb', value: -50 }
			]
		]);

		const snap = await readCurrentSong(page);
		const lead = snap?.tracks.find((t) => t.id === 'track-lead') as
			| { pan?: number; volume?: number }
			| undefined;
		// The real track op landed.
		expect(lead?.pan).toBe(0.5);
		// Original track still has its starting volume; ghost path didn't crash.
		expect(lead?.volume).toBe(-3);
		// And the song is still live and addressable.
		expect(snap?.tracks.length).toBe(1);
	});
});
