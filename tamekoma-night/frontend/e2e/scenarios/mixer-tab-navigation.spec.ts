// Tab navigation: a Premium user can switch between Flow → Mixer →
// Automation → Flow, and each tab renders its own content without
// throwing or losing the previously-mutated mixer state.

import { test, expect } from '../fixtures/full-stack';
import { callSongStore, readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-tab-nav';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Tab Nav',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C | F | G | C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 4 }],
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

test.describe('Mixer ↔ Flow ↔ Automation tab navigation', () => {
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

	test('Flow → Mixer → Automation → Flow round-trip preserves state', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		const pageErrors: Error[] = [];
		page.on('pageerror', (err) => pageErrors.push(err));

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		// Seed a chain node so the Mixer/Automation tabs have something to show.
		await callSongStore(page, 'addChainNode', [
			'track-lead',
			0,
			{ format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' }
		]);

		const flow = page.getByRole('tab', { name: 'Flow' });
		const mixer = page.getByRole('tab', { name: 'Mixer' });
		const automation = page.getByRole('tab', { name: 'Automation' });

		// Flow is the default.
		await expect(flow).toHaveAttribute('aria-selected', 'true');

		// Switch to Mixer.
		await mixer.click();
		await expect(mixer).toHaveAttribute('aria-selected', 'true');
		await expect(flow).toHaveAttribute('aria-selected', 'false');

		// Switch to Automation.
		await automation.click();
		await expect(automation).toHaveAttribute('aria-selected', 'true');
		await expect(mixer).toHaveAttribute('aria-selected', 'false');

		// Back to Flow.
		await flow.click();
		await expect(flow).toHaveAttribute('aria-selected', 'true');

		// State should still be alive: the chain we seeded survives the round-trip.
		const snap = await readCurrentSong(page);
		const t = snap?.tracks.find((x) => x.id === 'track-lead');
		expect(t?.chain?.length).toBe(1);
		expect(t?.chain?.[0]?.plugin?.uid).toBe('svf');

		expect(pageErrors, `page errors: ${pageErrors.map((e) => e.message).join('\n')}`).toEqual([]);
	});
});
