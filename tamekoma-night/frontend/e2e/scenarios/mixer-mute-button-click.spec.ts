// Click the actual mute button on a ChannelStrip and verify the songStore
// flips track.mute. Sister test of mixer-mute-solo-isolation which drives
// the store directly — this one exercises the button's onclick handler.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-mute-click';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Mute Click',
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

test.describe('Channel strip mute button click', () => {
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

	test('clicking the mute button toggles track.mute in the store', async ({
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

		const strip = page.locator('[data-track-id="track-lead"]');
		const muteBtn = strip.getByRole('button', { name: 'ミュート' });
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');

		await muteBtn.click();
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');

		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead') as
			| { mute?: boolean }
			| undefined;
		expect(t?.mute).toBe(true);

		// Click again → unmute.
		await muteBtn.click();
		await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
		const snap2 = await readCurrentSong(page);
		const t2 = snap2?.tracks.find((x) => x.id === 'track-lead') as
			| { mute?: boolean }
			| undefined;
		expect(t2?.mute).toBe(false);
	});
});
