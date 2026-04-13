// Free user CAN set a builtin instrument — the gate only bites for
// CLAP/VST3. Completes the triad: builtin allowed, CLAP/VST3 gated.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-instrument-builtin-ok';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Instrument Builtin OK',
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

test.describe('Premium gating — setTrackInstrument (builtin allowed)', () => {
	test.beforeEach(async ({ page }) => {
		const song = makeSong();
		const listItem: SongListItem = {
			id: SONG_ID,
			title: song.title,
			bpm: song.bpm,
			key: song.key,
			timeSignature: song.timeSignature,
			createdByName: 'Free User',
			createdAt: song.createdAt,
			lastEditedBy: 'Free User',
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
					name: 'Free User',
					email: 'free@test.com',
					sub: 'free-user',
					tier: 'free'
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

	test('setTrackInstrument(builtin) on free tier does NOT trigger premium gate', async ({
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

		await callSongStore(page, 'setTrackInstrument', [
			'track-lead',
			{ format: 'builtin', uid: 'supersaw', name: 'SuperSaw', vendor: 'Cadenza' }
		]);

		// Give any async gate dispatch a beat to land.
		await page.waitForTimeout(500);

		const pending = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { bridgeStore?: { premiumRequiredPending?: boolean } };
			};
			return w.__cadenza?.bridgeStore?.premiumRequiredPending ?? false;
		});
		expect(pending).toBe(false);

		// And the local store reflects the new instrument.
		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| { instrumentPlugin?: { uid?: string } }
			| undefined;
		expect(t?.instrumentPlugin?.uid).toBe('supersaw');
	});
});
