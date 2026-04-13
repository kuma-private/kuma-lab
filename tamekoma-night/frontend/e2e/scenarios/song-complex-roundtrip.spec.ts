// Load a song that already includes chain / sends / buses / master inserts /
// automation. Verify hydrateSong preserves every populated field rather than
// over-zealously stripping it back to defaults.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-complex-load';

const COMPLEX_SONG: Song = {
	id: SONG_ID,
	title: 'Complex Load',
	bpm: 132,
	timeSignature: '4/4',
	key: 'Am',
	chordProgression: '| Am | F | C | G |',
	sections: [
		{ id: 'intro', name: 'Intro', startBar: 1, endBar: 4 },
		{ id: 'verse', name: 'Verse', startBar: 5, endBar: 12 }
	],
	tracks: [
		{
			id: 'track-lead',
			name: 'Lead',
			instrument: 'piano',
			blocks: [],
			volume: -3,
			mute: false,
			solo: false,
			pan: -0.2,
			instrumentPlugin: {
				format: 'builtin',
				uid: 'supersaw',
				name: 'SuperSaw',
				vendor: 'Cadenza'
			},
			chain: [
				{
					id: 'gain-1',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' },
					bypass: false,
					params: { gainDb: 2 }
				},
				{
					id: 'svf-1',
					kind: 'insert',
					plugin: { format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' },
					bypass: false,
					params: { cutoff: 1800, resonance: 0.4 }
				}
			],
			sends: [
				{ id: 'send-1', destBusId: 'bus-rev', level: 0.35, pre: false }
			],
			automation: [
				{
					nodeId: 'svf-1',
					paramId: 'cutoff',
					points: [
						{ id: 'p1', tick: 0, value: 0.2, curve: 'linear' },
						{ id: 'p2', tick: 480, value: 0.85, curve: 'linear' }
					]
				}
			]
		}
	],
	createdBy: 'dev-user',
	createdAt: '2026-04-01T00:00:00.000Z',
	lastEditedAt: '2026-04-01T00:00:00.000Z',
	buses: [
		{
			id: 'bus-rev',
			name: 'Reverb',
			chain: [],
			sends: [],
			volume: -2,
			pan: 0
		}
	],
	master: {
		volume: 0.95,
		chain: [
			{
				id: 'm-sat',
				kind: 'insert',
				plugin: {
					format: 'builtin',
					uid: 'saturation',
					name: 'Saturation',
					vendor: 'Cadenza'
				},
				bypass: false,
				params: {}
			}
		]
	}
};

test.describe('Complex song load preserves every field', () => {
	test.beforeEach(async ({ page }) => {
		const listItem: SongListItem = {
			id: SONG_ID,
			title: COMPLEX_SONG.title,
			bpm: COMPLEX_SONG.bpm,
			key: COMPLEX_SONG.key,
			timeSignature: COMPLEX_SONG.timeSignature,
			createdByName: 'Dev User',
			createdAt: COMPLEX_SONG.createdAt,
			lastEditedBy: 'Dev User',
			lastEditedAt: COMPLEX_SONG.lastEditedAt,
			trackCount: COMPLEX_SONG.tracks.length,
			sectionCount: COMPLEX_SONG.sections.length,
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
				body: JSON.stringify(COMPLEX_SONG)
			})
		);
	});

	test('every populated field survives hydration', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const snap = (await readCurrentSong(page)) as
			| {
					title?: string;
					bpm?: number;
					key?: string;
					sections?: Array<{ id: string; name: string }>;
					tracks?: Array<{
						id: string;
						name: string;
						pan?: number;
						volume?: number;
						instrumentPlugin?: { uid?: string };
						chain?: Array<{ id: string; plugin?: { uid?: string }; params?: Record<string, number> }>;
						sends?: Array<{ id: string; level: number }>;
						automation?: Array<{
							nodeId: string;
							paramId: string;
							points: Array<{ id: string; tick: number; value: number }>;
						}>;
					}>;
					buses?: Array<{ id: string; name: string; volume?: number }>;
					master?: { volume?: number; chain?: Array<{ id: string }> };
			  }
			| null;

		expect(snap?.title).toBe('Complex Load');
		expect(snap?.bpm).toBe(132);
		expect(snap?.key).toBe('Am');
		expect(snap?.sections?.length).toBe(2);

		const t = snap?.tracks?.[0];
		expect(t?.pan).toBe(-0.2);
		expect(t?.volume).toBe(-3);
		expect(t?.instrumentPlugin?.uid).toBe('supersaw');
		expect(t?.chain?.length).toBe(2);
		expect(t?.chain?.[1]?.params?.cutoff).toBe(1800);
		expect(t?.sends?.length).toBe(1);
		expect(t?.sends?.[0]?.level).toBe(0.35);
		expect(t?.automation?.[0]?.points.length).toBe(2);
		expect(t?.automation?.[0]?.points[1]?.value).toBe(0.85);

		expect(snap?.buses?.length).toBe(1);
		expect(snap?.buses?.[0]?.volume).toBe(-2);
		expect(snap?.master?.volume).toBe(0.95);
		expect(snap?.master?.chain?.length).toBe(1);
		expect(snap?.master?.chain?.[0]?.id).toBe('m-sat');
	});
});
