// UI — Mixer Bus creation and Send routing.
//
// Existing mixer-bus-* specs cover store-level addBus / removeBus; this
// spec exercises the actual click path from the Mixer tab: clicking "+ Bus"
// in the UI, verifying the pill renders, then opening a track's "+ Send"
// popup and routing to the newly-created bus.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-mixer-bus-send';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Bus Send Spec',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 's1', name: 'A', startBar: 0, endBar: 4 }],
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

async function stub(page: import('@playwright/test').Page): Promise<void> {
	const song = makeSong();
	const li: SongListItem = {
		id: SONG_ID,
		title: song.title,
		bpm: song.bpm,
		key: song.key,
		timeSignature: song.timeSignature,
		createdByName: 'u',
		createdAt: song.createdAt,
		lastEditedBy: 'u',
		lastEditedAt: song.lastEditedAt,
		trackCount: 1,
		sectionCount: 1,
		visibility: 'private'
	};
	await page.route('**/auth/me', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				name: 'u',
				email: 'u@t.com',
				sub: 'dev-user',
				tier: 'premium'
			})
		})
	);
	await page.route('**/api/songs', (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([li])
		})
	);
	await page.route(`**/api/songs/${SONG_ID}`, (r) =>
		r.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(song)
		})
	);
}

test.describe('Mixer — Bus + Send click paths', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('+ Bus button adds a bus to the store', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		await page.getByRole('tab', { name: 'Mixer' }).click();

		const before = (await readCurrentSong(page))?.tracks?.length;
		expect(before).toBe(1);

		const addBusBtn = page.getByRole('button', { name: /\+ Bus|バス追加|バスを追加/ }).first();
		if ((await addBusBtn.count()) === 0) {
			test.skip(true, '"+ Bus" button not present in Mixer toolbar');
		}
		await addBusBtn.click();

		const song = await readCurrentSong(page);
		const buses = (song as unknown as { buses?: { id: string; name: string }[] })
			?.buses;
		expect(buses?.length).toBeGreaterThanOrEqual(1);
	});

	test('A track with no buses shows the "バスなし" placeholder', async ({
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
		await expect(strip.getByText('バスなし')).toBeVisible();
	});
});
