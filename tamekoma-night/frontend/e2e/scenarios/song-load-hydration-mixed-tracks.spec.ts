// Song load hydration — mixed legacy + new tracks.
//
// Some repositories still store older songs where only a subset of tracks
// were edited after the chain/sends/pan/automation fields were introduced.
// hydrateSong must default every track independently: populated arrays are
// preserved, absent arrays are filled with empty defaults. A single "mixed
// bag" song pins this per-track behavior.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';

const SONG_ID = 'song-load-hydration-mixed';

const MIXED_SONG = {
	id: SONG_ID,
	title: 'Mixed Tracks',
	bpm: 120,
	timeSignature: '4/4',
	key: 'C',
	chordProgression: '| C |',
	sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
	tracks: [
		// Track 0 — legacy, none of the new optional fields at all.
		{
			id: 'track-legacy',
			name: 'Legacy',
			instrument: 'piano',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false
		},
		// Track 1 — modern, has chain populated but no automation / sends / pan.
		{
			id: 'track-modern-chain',
			name: 'Modern Chain',
			instrument: 'bass',
			blocks: [],
			volume: -3,
			mute: false,
			solo: false,
			chain: [
				{
					id: 'gain-1',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' },
					bypass: false,
					params: { gainDb: 2 }
				}
			]
		},
		// Track 2 — modern, only automation set. Chain / sends / pan still absent.
		{
			id: 'track-modern-auto',
			name: 'Modern Auto',
			instrument: 'strings',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false,
			automation: [
				{
					nodeId: 'svf-x',
					paramId: 'cutoff',
					points: [{ id: 'p1', tick: 0, value: 0.5, curve: 'linear' }]
				}
			]
		},
		// Track 3 — modern, pan explicitly set to a non-zero value.
		{
			id: 'track-pan-only',
			name: 'Pan Only',
			instrument: 'drums',
			blocks: [],
			volume: 0,
			mute: false,
			solo: false,
			pan: -0.7
		}
	],
	createdBy: 'dev-user',
	createdAt: new Date().toISOString(),
	lastEditedAt: new Date().toISOString()
};

test.describe('Mixed legacy + new tracks hydration', () => {
	test.beforeEach(async ({ page }) => {
		const listItem = {
			id: SONG_ID,
			title: MIXED_SONG.title,
			bpm: MIXED_SONG.bpm,
			key: MIXED_SONG.key,
			timeSignature: MIXED_SONG.timeSignature,
			createdByName: 'Dev User',
			createdAt: MIXED_SONG.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: MIXED_SONG.lastEditedAt,
			trackCount: MIXED_SONG.tracks.length,
			sectionCount: 1,
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
				body: JSON.stringify(MIXED_SONG)
			})
		);
	});

	test('each track hydrates its absent fields independently', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const snap = (await readCurrentSong(page)) as unknown as {
			tracks: Array<{
				id: string;
				chain?: unknown[];
				sends?: unknown[];
				pan?: number;
				automation?: Array<{ nodeId: string; paramId: string; points: unknown[] }>;
			}>;
		} | null;
		expect(snap).not.toBeNull();
		const byId = new Map((snap!.tracks ?? []).map((t) => [t.id, t]));

		// Legacy — every new field hydrated to defaults.
		const legacy = byId.get('track-legacy')!;
		expect(legacy.chain).toEqual([]);
		expect(legacy.sends).toEqual([]);
		expect(legacy.pan).toBe(0);
		expect(legacy.automation).toEqual([]);

		// Modern chain — chain preserved, other fields defaulted.
		const modernChain = byId.get('track-modern-chain')!;
		expect(Array.isArray(modernChain.chain)).toBe(true);
		expect((modernChain.chain as Array<{ id: string }>).length).toBe(1);
		expect((modernChain.chain as Array<{ id: string }>)[0].id).toBe('gain-1');
		expect(modernChain.sends).toEqual([]);
		expect(modernChain.pan).toBe(0);
		expect(modernChain.automation).toEqual([]);

		// Modern auto — automation preserved, other fields defaulted.
		const modernAuto = byId.get('track-modern-auto')!;
		expect(modernAuto.chain).toEqual([]);
		expect(modernAuto.sends).toEqual([]);
		expect(modernAuto.pan).toBe(0);
		expect(modernAuto.automation?.length).toBe(1);
		expect(modernAuto.automation?.[0].nodeId).toBe('svf-x');
		expect(modernAuto.automation?.[0].paramId).toBe('cutoff');
		expect(modernAuto.automation?.[0].points.length).toBe(1);

		// Pan only — pan preserved (not replaced by 0 default).
		const panOnly = byId.get('track-pan-only')!;
		expect(panOnly.pan).toBe(-0.7);
		expect(panOnly.chain).toEqual([]);
		expect(panOnly.sends).toEqual([]);
		expect(panOnly.automation).toEqual([]);
	});
});
