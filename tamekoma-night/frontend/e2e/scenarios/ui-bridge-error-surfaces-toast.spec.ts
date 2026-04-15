// UI — songStore.mutate() bridge rejection surfaces an error toast.
//
// Regression for the silent failure mode where a non-premium_required
// rejection from `bridgeStore.client.send({ type: 'project.patch' })` was
// swallowed into console.warn. Now the user sees a toast so they know the
// edit reached their store but never made it to the running Bridge audio
// graph (e.g. a transient network error or a schema mismatch).
//
// premium_required still routes through the dedicated upgrade modal —
// this spec also asserts that a premium_required rejection does NOT
// surface as a generic error toast.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong, callSongStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-ui-bridge-error-toast';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Bridge Error Toast',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 's1', name: 'A', startBar: 0, endBar: 4 }],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
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

test.describe('songStore.mutate — bridge rejection surfacing', () => {
	test.beforeEach(async ({ page }) => {
		await stub(page);
	});

	test('non-premium_required bridge rejection shows an error toast', async ({
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

		// Stub bridgeStore.client.send so any project.patch rejects with a
		// generic error (NOT premium_required). The catch branch in
		// song.svelte.ts mutate() should surface this via showToast.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						client?: { send?: (cmd: unknown) => Promise<unknown> };
					};
				};
			};
			const client = w.__cadenza?.bridgeStore?.client;
			if (!client) throw new Error('bridgeStore.client missing');
			client.send = async (cmd: unknown) => {
				if (cmd && typeof cmd === 'object' && (cmd as { type?: string }).type === 'project.patch') {
					throw new Error('schema mismatch');
				}
				return { ok: true };
			};
		});

		// Trigger any mutate() — setTrackVolume goes through mutate with
		// project.patch ops attached.
		await callSongStore(page, 'setTrackVolume', ['track-piano', -3]);

		// The toast container is rendered globally; assert any toast text
		// containing the error message appears within 2s.
		await expect(page.getByText(/schema mismatch|Bridge.*失敗/i).first()).toBeVisible({
			timeout: 2_000
		});
	});

	test('premium_required rejection does NOT show a generic error toast', async ({
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

		// Premium_required code triggers the dedicated upgrade-prompt path,
		// not the generic toast.
		await page.evaluate(() => {
			const w = window as unknown as {
				__cadenza?: {
					bridgeStore?: {
						client?: { send?: (cmd: unknown) => Promise<unknown> };
					};
				};
			};
			const client = w.__cadenza?.bridgeStore?.client;
			if (!client) throw new Error('bridgeStore.client missing');
			client.send = async (cmd: unknown) => {
				if (cmd && typeof cmd === 'object' && (cmd as { type?: string }).type === 'project.patch') {
					const err = new Error('premium feature locked');
					(err as unknown as { code: string }).code = 'premium_required';
					throw err;
				}
				return { ok: true };
			};
		});

		await callSongStore(page, 'setTrackVolume', ['track-piano', -3]);

		// Wait briefly to let any toast that would render do so.
		await page.waitForTimeout(800);
		const errorToasts = await page
			.locator('text=/Bridge.*失敗/i')
			.count();
		expect(errorToasts).toBe(0);
	});
});
