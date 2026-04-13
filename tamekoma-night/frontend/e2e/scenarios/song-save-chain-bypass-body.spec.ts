// Song save — chain node bypass round-trip.
//
// addChainNode defaults bypass=false; flipping it via setChainBypass(true)
// must survive saveSong and land in the PUT payload. Guards against the
// bypass flag being stripped on serialize (a regression we hit once when
// the Bridge protocol's wire field was mistyped).

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-save-chain-bypass';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Chain Bypass',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 0, endBar: 4 }],
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

test.describe('Song save — chain bypass in PUT body', () => {
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

	test('setChainBypass(true) survives saveSong and lands in PUT body', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Add two chain nodes so we can prove bypass is per-node.
		const nodeA = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' }
		]);
		const nodeB = await callSongStore<string>(page, 'addChainNode', [
			'track-lead',
			1,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);

		// Flip bypass true on node A; leave node B untouched (bypass=false).
		await callSongStore(page, 'setChainBypass', ['track-lead', nodeA, true]);

		await callSongStore(page, 'saveSong', []);
		await expect.poll(() => putBody !== null, { timeout: 5_000 }).toBe(true);

		const body = putBody as {
			tracks?: Array<{
				id?: string;
				chain?: Array<{ id: string; bypass?: boolean; plugin?: { uid?: string } }>;
			}>;
		};
		const t = body.tracks?.find((x) => x.id === 'track-lead');
		expect(t?.chain?.length).toBe(2);
		const a = t?.chain?.find((n) => n.id === nodeA);
		const b = t?.chain?.find((n) => n.id === nodeB);
		expect(a?.bypass).toBe(true);
		expect(a?.plugin?.uid).toBe('gain');
		expect(b?.bypass).toBe(false);
		expect(b?.plugin?.uid).toBe('svf');
	});
});
