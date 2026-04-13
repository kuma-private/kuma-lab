// Mixer/Automation tab visibility based on plan + bridge state.
//
// 1. Free user with bridge connected → no Mixer/Automation tab
// 2. Premium user with bridge offline → tabs visible, content shows curtain
// 3. Premium user with bridge online → full Mixer + Automation

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-tab-gating';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Tab Gating',
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

function listItem() {
	const s = makeSong();
	return {
		id: SONG_ID,
		title: s.title,
		bpm: s.bpm,
		key: s.key,
		timeSignature: s.timeSignature,
		createdByName: 'Dev User',
		createdAt: s.createdAt,
		lastEditedBy: 'Dev User',
		lastEditedAt: s.lastEditedAt,
		trackCount: s.tracks.length,
		sectionCount: s.sections.length,
		visibility: 'private'
	} as SongListItem;
}

test.describe('Mixer tab gating by plan + bridge', () => {
	test('premium + connected → Mixer tab is in the tab bar', async ({ page, bridge }) => {
		expect(bridge.url).toBeTruthy();
		const song = makeSong();
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
				body: JSON.stringify([listItem()])
			})
		);
		await page.route(`**/api/songs/${SONG_ID}`, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(song)
			})
		);

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');

		// The Mixer tab button should be visible. Use a button locator.
		const mixerTab = page.getByRole('tab', { name: 'Mixer' });
		const automationTab = page.getByRole('tab', { name: 'Automation' });
		await expect(mixerTab).toBeVisible();
		await expect(automationTab).toBeVisible();
	});
});
