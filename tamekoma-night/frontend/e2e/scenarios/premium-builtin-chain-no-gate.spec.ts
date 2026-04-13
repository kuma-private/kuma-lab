// Negative gating test: a premium user adding a builtin gain effect to
// a track chain must NOT trigger the premium_required signal. Counterpart
// to premium-gating-error / premium-gating-clap which prove the gate
// fires for vst3/clap on a free user — this proves the gate stays silent
// for the happy path.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-builtin-chain-ok';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Builtin Chain OK',
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

test.describe('Premium gating (negative) — builtin chain node on premium user', () => {
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
		// Premium /auth/me + the premium project's storageState override
		// → planStore.tier = premium. dev-user is in CADENZA_DEV_PREMIUM_UIDS,
		// so the backend will issue a real bridge ticket.
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

	test('addChainNode(builtin gain) on premium user does NOT raise premium_required', async ({
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

		await callSongStore(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'gain', name: 'Gain', vendor: 'Cadenza' }
		]);

		// Give any async dispatch a beat to land.
		await page.waitForTimeout(500);

		const flag = await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						premiumRequiredPending?: boolean;
						premiumRequiredFeature?: string | null;
					};
				};
			};
			const b = w.__cadenza?.bridgeStore;
			return {
				pending: b?.premiumRequiredPending ?? false,
				feature: b?.premiumRequiredFeature ?? null
			};
		});
		expect(flag.pending).toBe(false);
		expect(flag.feature).toBeNull();

		// And the chain on the local store reflects the new node.
		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead');
		expect(t?.chain?.length ?? 0).toBeGreaterThan(0);
		expect(t?.chain?.[0]?.plugin?.uid).toBe('gain');
	});
});
