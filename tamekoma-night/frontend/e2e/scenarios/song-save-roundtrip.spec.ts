// Song save round-trip scenario.
//
// After mutating a song via Mixer (chain + automation + send), call
// songStore.saveSong() and verify the API receives the updated payload.
// This locks in that all the new optional Bridge fields survive the
// /api/songs/{id} PUT.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-roundtrip';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Save Round-trip',
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

test.describe('Song save round-trip', () => {
	let putBody: unknown = null;

	test.beforeEach(async ({ page }) => {
		putBody = null;
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
		// GET returns the original. PUT captures the body and echoes it back.
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(putBody ?? song)
				});
			} else {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(song)
				});
			}
		});
	});

	test('saveSong sends mutated chain + sends + automation to /api/songs/{id}', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Build out a mixer state.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'cutoff', 4000]);
		const busId = await callSongStore<string>(page, 'addBus', ['Reverb']);
		await callSongStore(page, 'addSend', ['track-lead', busId, 0.4]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'cutoff']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'cutoff',
			0,
			0.2,
			'linear'
		]);

		// Trigger a save (no args).
		await callSongStore(page, 'saveSong', []);

		// Verify the PUT was captured and contains all the mutation paths.
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as {
			tracks?: Array<{
				id?: string;
				chain?: Array<{ id: string; plugin?: { uid?: string } }>;
				sends?: Array<{ destBusId?: string; level?: number }>;
				automation?: Array<{ nodeId: string; paramId: string; points?: unknown[] }>;
			}>;
			buses?: Array<{ id?: string; name?: string }>;
		};
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t?.chain?.[0]?.plugin?.uid).toBe('svf');
		expect(t?.sends?.[0]?.destBusId).toBe(busId);
		expect(t?.sends?.[0]?.level).toBe(0.4);
		expect(t?.automation?.[0]?.paramId).toBe('cutoff');
		expect((t?.automation?.[0]?.points ?? []).length).toBe(1);
		expect(body.buses?.find((b) => b.id === busId)?.name).toBe('Reverb');
	});
});
