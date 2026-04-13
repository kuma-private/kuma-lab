// Mega save-body scenario.
//
// One song with EVERY persisted field populated (chain + sends +
// automation + buses + master + sections + chordProgression + meta),
// saved via songStore.saveSong(), verified end-to-end in the PUT body.
// Unlike song-save-roundtrip which only checks mixer fields, this locks
// in that nothing gets silently dropped from the /api/songs/{id} PUT
// payload when all optional slots are occupied simultaneously.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-mega-body';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mega Body',
		bpm: 138,
		timeSignature: '6/8',
		key: 'D Minor',
		chordProgression: '| Dm | Gm | A7 | Dm |',
		sections: [
			{ id: 'sec-intro', name: 'Intro', startBar: 0, endBar: 4 },
			{ id: 'sec-verse', name: 'Verse', startBar: 4, endBar: 8 }
		],
		tracks: [
			{
				id: 'track-lead',
				name: 'Lead',
				instrument: 'piano',
				blocks: [
					{ id: 'blk-1', startBar: 0, endBar: 4, directives: 'play C4 q' }
				],
				volume: -3,
				mute: false,
				solo: false,
				pan: 0.25,
				chain: [
					{
						id: 'pre-chain-node',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'eq', name: 'EQ', vendor: 'Cadenza' },
						bypass: false,
						params: { gain: 2 }
					}
				],
				sends: [],
				automation: []
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		buses: [],
		master: { chain: [], volume: 0.8 }
	};
}

test.describe('Song save mega body roundtrip', () => {
	let putBody: Record<string, unknown> | null = null;

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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				// Echo back the PUT body with id preserved so hydrateSong works.
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ ...(putBody ?? song), id: SONG_ID })
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

	test('saveSong sends chain + sends + automation + buses + master + sections in one PUT', async ({
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

		// Drive the mixer through every optional slot.
		const nodeId = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'compressor', name: 'Comp', vendor: 'Cadenza' }
		]);
		await callSongStore(page, 'setChainParam', ['track-lead', nodeId, 'threshold', -12]);
		const busA = await callSongStore<string>(page, 'addBus', ['Reverb']);
		const busB = await callSongStore<string>(page, 'addBus', ['Delay']);
		await callSongStore(page, 'addSend', ['track-lead', busA, 0.35]);
		await callSongStore(page, 'addSend', ['track-lead', busB, 0.2, true]);
		await callSongStore(page, 'addAutomationLane', ['track-lead', nodeId, 'threshold']);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'threshold',
			0,
			0.1,
			'linear'
		]);
		await callSongStore(page, 'addAutomationPoint', [
			'track-lead',
			nodeId,
			'threshold',
			240,
			0.9,
			'exponential'
		]);

		await callSongStore(page, 'saveSong', []);

		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		// ── Meta fields ────────────────────────────────
		const body = putBody as {
			title?: string;
			bpm?: number;
			timeSignature?: string;
			key?: string;
			chordProgression?: string;
			sections?: Array<{ id: string; name: string; startBar: number; endBar: number }>;
			tracks?: Array<{
				id?: string;
				chain?: Array<{ id: string; plugin?: { uid?: string }; params?: Record<string, number> }>;
				sends?: Array<{ id: string; destBusId?: string; level?: number; pre?: boolean }>;
				automation?: Array<{
					nodeId: string;
					paramId: string;
					points?: Array<{ tick: number; value: number; curve?: string }>;
				}>;
			}>;
			buses?: Array<{ id?: string; name?: string }>;
			master?: { chain?: unknown[]; volume?: number };
		};
		expect(body.title).toBe('Mega Body');
		expect(body.bpm).toBe(138);
		expect(body.timeSignature).toBe('6/8');
		expect(body.key).toBe('D Minor');
		expect(body.chordProgression).toBe('| Dm | Gm | A7 | Dm |');

		// ── Sections (both preserved) ─────────────────
		expect(body.sections?.length).toBe(2);
		expect(body.sections?.map((s) => s.name).sort()).toEqual(['Intro', 'Verse']);

		// ── Track chain (pre-existing EQ + new compressor) ─
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t?.chain?.length).toBe(2);
		expect(t?.chain?.map((n) => n.plugin?.uid).sort()).toEqual(['compressor', 'eq']);
		const comp = t?.chain?.find((n) => n.plugin?.uid === 'compressor');
		expect(comp?.params?.threshold).toBe(-12);

		// ── Track sends (2, with pre flag) ────────────
		expect(t?.sends?.length).toBe(2);
		const reverbSend = t?.sends?.find((s) => s.destBusId === busA);
		expect(reverbSend?.level).toBe(0.35);
		expect(reverbSend?.pre).toBe(false);
		const delaySend = t?.sends?.find((s) => s.destBusId === busB);
		expect(delaySend?.level).toBe(0.2);
		expect(delaySend?.pre).toBe(true);

		// ── Automation lane with 2 points ─────────────
		expect(t?.automation?.length).toBe(1);
		const lane = t?.automation?.[0];
		expect(lane?.paramId).toBe('threshold');
		expect(lane?.points?.length).toBe(2);
		expect(lane?.points?.map((p) => p.tick).sort((a, b) => a - b)).toEqual([0, 240]);

		// ── Buses (2 created) ─────────────────────────
		expect(body.buses?.length).toBe(2);
		expect(body.buses?.map((b) => b.name).sort()).toEqual(['Delay', 'Reverb']);

		// ── Master preserved ─────────────────────────
		expect(body.master?.volume).toBe(0.8);
		expect(body.master?.chain).toEqual([]);
	});
});
