// ChannelStrip sends rendering — a track with three sends shows three
// SendKnob widgets inside the sends section. Asserts the {#each sends}
// loop renders each configured send and that knob aria-labels use the
// resolved bus names.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-channel-strip-multi-sends';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Multi Sends',
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
				sends: [
					{ id: 'send-a', destBusId: 'bus-reverb', level: 0.3, pre: false },
					{ id: 'send-b', destBusId: 'bus-delay', level: 0.5, pre: false },
					{ id: 'send-c', destBusId: 'bus-chorus', level: 0.2, pre: true }
				],
				pan: 0,
				automation: []
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now,
		buses: [
			{ id: 'bus-reverb', name: 'Reverb', volume: 0, chain: [] },
			{ id: 'bus-delay', name: 'Delay', volume: 0, chain: [] },
			{ id: 'bus-chorus', name: 'Chorus', volume: 0, chain: [] }
		],
		master: { chain: [], volume: 1 }
	};
}

test.describe('Mixer ChannelStrip multi-send rendering', () => {
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

	test('three sends on one track render three SendKnobs with bus-name labels', async ({
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

		const strip = page.locator('.strip[data-track-id="track-lead"]');
		await expect(strip).toBeVisible();

		// Exactly three knob buttons rendered inside this strip.
		const knobs = strip.locator('.send-knob .knob');
		await expect(knobs).toHaveCount(3);

		// Each knob carries a "{bus name} 送り量" aria-label.
		await expect(strip.getByRole('button', { name: 'Reverb 送り量' })).toBeVisible();
		await expect(strip.getByRole('button', { name: 'Delay 送り量' })).toBeVisible();
		await expect(strip.getByRole('button', { name: 'Chorus 送り量' })).toBeVisible();
	});
});
