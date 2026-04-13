// Reactivity check: tabs respond to a runtime planStore.setTier() call.
// Start as premium → Mixer + Automation visible. Imperatively flip to
// free → both tabs disappear. Locks in that the layout's gating
// expression observes planStore.tier rather than caching the boot value.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-tab-tier-flip';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Tab Tier Flip',
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

test.describe('Mixer tab reacts to planStore.setTier flip', () => {
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

	test('setTier(free) at runtime hides Mixer + Automation tabs', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// Start: tabs visible (premium override + premium /auth/me).
		await expect(page.getByRole('tab', { name: 'Mixer' })).toBeVisible({ timeout: 10_000 });
		await expect(page.getByRole('tab', { name: 'Automation' })).toBeVisible();

		// Flip to free at runtime.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: { planStore?: { setTier?: (t: 'free' | 'premium') => void } };
			};
			w.__cadenza?.planStore?.setTier?.('free');
		});

		// Both tabs should disappear from the tab bar.
		await expect(page.getByRole('tab', { name: 'Mixer' })).toHaveCount(0, { timeout: 5_000 });
		await expect(page.getByRole('tab', { name: 'Automation' })).toHaveCount(0);
	});
});
