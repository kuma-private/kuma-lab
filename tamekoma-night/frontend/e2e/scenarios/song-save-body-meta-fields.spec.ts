// Song save PUT body — top-level meta fields.
//
// Locks in that saveSong() includes `sections`, `chordProgression`,
// `bpm`, and `key` in the PUT payload, even when those fields were
// mutated only via the `setCurrentSong` swap path (as FlowEditor does
// when it rewrites the chord progression). Regression guard against
// someone accidentally trimming saveSong()'s body back to tracks-only.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-meta-fields';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Meta Fields',
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

test.describe('Song save — top-level meta fields in PUT body', () => {
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
		await page.route(`**/api/songs/${SONG_ID}`, async (route) => {
			if (route.request().method() === 'PUT') {
				try {
					putBody = JSON.parse(route.request().postData() ?? '{}');
				} catch {
					putBody = null;
				}
				// Always include id in the echoed body (real backend does this).
				const echoed = { id: SONG_ID, ...(putBody as object) };
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(echoed)
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

	test('PUT body carries bpm / key / chordProgression / sections after setCurrentSong swap', async ({
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

		// Swap in a mutated song via setCurrentSong — the path FlowEditor uses.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					songStore?: {
						currentSong?: Record<string, unknown>;
						setCurrentSong?: (s: unknown) => void;
					};
				};
			};
			const ss = w.__cadenza?.songStore;
			if (!ss?.currentSong || !ss.setCurrentSong) return;
			ss.setCurrentSong({
				...JSON.parse(JSON.stringify(ss.currentSong)),
				bpm: 144,
				key: 'F#m',
				chordProgression: '| F#m | A | E | B |',
				sections: [
					{ id: 'sec-intro', name: 'Intro', startBar: 0, endBar: 4 },
					{ id: 'sec-verse', name: 'Verse', startBar: 4, endBar: 12 }
				]
			});
		});

		// Fire the save explicitly.
		await page.evaluate(async () => {
			const w = window as unknown as {
				__cadenza?: { songStore?: { saveSong?: () => Promise<void> } };
			};
			await w.__cadenza?.songStore?.saveSong?.();
		});

		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as {
			bpm?: number;
			key?: string;
			chordProgression?: string;
			sections?: Array<{ id: string; name: string; startBar: number; endBar: number }>;
		};
		expect(body.bpm).toBe(144);
		expect(body.key).toBe('F#m');
		expect(body.chordProgression).toBe('| F#m | A | E | B |');
		expect(body.sections?.length).toBe(2);
		expect(body.sections?.[0]?.name).toBe('Intro');
		expect(body.sections?.[1]?.name).toBe('Verse');
		expect(body.sections?.[1]?.endBar).toBe(12);
	});
});
