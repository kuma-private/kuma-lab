// Mixer SendKnob renders for an existing send and doubleclick resets level.
//
// Seeds a bus + an existing send on the track via callSongStore (so the
// ChannelStrip renders a SendKnob), then asserts the rotary button
// (aria-label "<bus> 送り量") is visible with the seeded level in its title.
// Double-clicking the knob invokes handleDblClick -> onChange(0), which
// the ChannelStrip wires to songStore.setSendLevel, so the store level
// drops to 0.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mixer-sendknob-renders-and-resets';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'SendKnob Renders',
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

test.describe('Mixer SendKnob renders and resets', () => {
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

	test('existing send renders a SendKnob and dblclick resets the level to 0', async ({
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

		// Seed a bus + a send on the track at level 0.75.
		const busId = await callSongStore<string>(page, 'addBus', ['Reverb']);
		const sendId = await callSongStore<string>(page, 'addSend', [
			'track-lead',
			busId,
			0.75,
			false
		]);
		expect(typeof sendId).toBe('string');

		// Navigate to the Mixer tab.
		await page.getByRole('tab', { name: 'Mixer' }).click();
		const strip = page.locator('[data-track-id="track-lead"]');
		await expect(strip).toBeVisible();

		// The SendKnob button is labeled "<bus name> 送り量".
		const knob = strip.getByRole('button', { name: 'Reverb 送り量' });
		await expect(knob).toBeVisible();

		// Title attribute carries the formatted level value, e.g. "Reverb: 0.75 ..."
		await expect(knob).toHaveAttribute('title', /Reverb: 0\.75/);

		// Double-click the knob -> handleDblClick -> onChange(0).
		await knob.dblclick();

		// Store side: the send level should now be 0.
		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-lead');
					return t?.sends?.find((s) => s.id === sendId)?.level;
				},
				{ timeout: 5_000 }
			)
			.toBe(0);

		// Title should update to reflect the new level.
		await expect(knob).toHaveAttribute('title', /Reverb: 0\.00/);
	});
});
