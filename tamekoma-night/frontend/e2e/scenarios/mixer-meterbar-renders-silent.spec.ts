// Mixer MeterBar renders one bar per track strip and sits silent at 0.
//
// With two tracks seeded, the ChannelStrip renders a MeterBar inside its
// .fader-row for each track. Since Phase 5 has no metering events wired,
// bridgeStore.meters is empty and the bars stay at 0% height. This spec
// covers the MeterBar render path (toPct(0) => 0%) and confirms the
// component is present for every strip.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-meterbar-renders-silent';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'MeterBar Renders',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-a',
				name: 'Alpha',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false,
				chain: [],
				sends: [],
				pan: 0,
				automation: []
			},
			{
				id: 'track-b',
				name: 'Beta',
				instrument: 'bass',
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

test.describe('Mixer MeterBar renders silent', () => {
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

	test('each track strip renders a MeterBar sitting at 0% with no metering data', async ({
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

		await page.getByRole('tab', { name: 'Mixer' }).click();

		const stripA = page.locator('[data-track-id="track-a"]');
		const stripB = page.locator('[data-track-id="track-b"]');
		await expect(stripA).toBeVisible();
		await expect(stripB).toBeVisible();

		// Each strip renders exactly one .meter (MeterBar) inside .fader-row.
		const meterA = stripA.locator('.fader-row .meter');
		const meterB = stripB.locator('.fader-row .meter');
		await expect(meterA).toHaveCount(1);
		await expect(meterB).toHaveCount(1);

		// MeterBar has aria-label "レベルメーター" (aria-hidden, but attribute still set).
		await expect(meterA).toHaveAttribute('aria-label', 'レベルメーター');
		await expect(meterB).toHaveAttribute('aria-label', 'レベルメーター');

		// Each meter contains two channels, each with a .peak and .rms bar
		// (total 4 bars). With no metering data, every bar has inline
		// "height: 0%".
		const bars = meterA.locator('.bar');
		await expect(bars).toHaveCount(4);
		for (let i = 0; i < 4; i++) {
			const style = await bars.nth(i).getAttribute('style');
			expect(style ?? '').toContain('height: 0%');
		}

		// Second strip behaves identically.
		const barsB = meterB.locator('.bar');
		await expect(barsB).toHaveCount(4);
		for (let i = 0; i < 4; i++) {
			const style = await barsB.nth(i).getAttribute('style');
			expect(style ?? '').toContain('height: 0%');
		}
	});
});
