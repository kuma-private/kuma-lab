// Free user opens a song page WHILE the bridge is connected. Even with
// a live bridge, both the Mixer and Automation tabs must be absent — the
// gate is plan-based, not bridge-state-based. Sister to mixer-tab-gating
// (which only covers the premium+connected positive case) and free-flow
// (which runs without a bridge fixture).

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-tab-hidden-free-bridge';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Tab Hidden Free Bridge',
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

test.describe('Mixer/Automation tabs hidden for free user even when bridge connected', () => {
	test.beforeEach(async ({ page }) => {
		// The premium project's storageState pre-seeds the override; wipe it
		// before mount so /auth/me's tier=free actually wins.
		await page.addInitScript(() => {
			window.localStorage.removeItem('cadenzaPlanOverride');
		});

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
		await page.route('**/api/bridge/ticket', (route) =>
			route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({ error: 'not_premium' })
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

	test('free + bridge connected → Mixer & Automation tabs absent', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Confirm the planStore actually fell through to free.
		const tier = await page.evaluate(() => {
			const w = window as unknown as { __cadenza?: { planStore?: { tier?: string } } };
			return w.__cadenza?.planStore?.tier ?? null;
		});
		expect(tier).toBe('free');

		// The Flow tab is the default for free users.
		await expect(page.getByRole('tab', { name: 'Flow' })).toBeVisible({ timeout: 10_000 });

		// And Mixer/Automation must not be in the tab bar at all.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);
	});
});
