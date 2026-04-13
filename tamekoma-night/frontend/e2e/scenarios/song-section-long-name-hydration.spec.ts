// Sections with a very long (200+ char) name must survive hydrateSong
// unchanged. No truncation, no replacement, the whole string reaches
// currentSong.sections.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-section-long-name-hydration';

// 260 characters: kana + ASCII mixed to exercise multi-byte too.
const LONG_NAME =
	'超絶ブリッジセクション ' +
	'A'.repeat(120) +
	' — とてもとても長い名前のセクション — ' +
	'Z'.repeat(80);

function makeSong() {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'Long Section Name',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec-long', name: LONG_NAME, startBar: 1, endBar: 4 }],
		tracks: [
			{
				id: 'track-lead',
				name: 'Lead',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false
			}
		],
		createdBy: 'dev-user',
		createdAt: now,
		lastEditedAt: now
	};
}

test.describe('Long section name hydration', () => {
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
			trackCount: 1,
			sectionCount: 1,
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

	test('200+ char section name is preserved verbatim through hydrateSong', async ({
		page,
		bridge
	}) => {
		expect(bridge.url).toBeTruthy();
		// Sanity-check the fixture itself.
		expect(LONG_NAME.length).toBeGreaterThanOrEqual(200);

		await page.goto(`/song/${SONG_ID}`);
		await expect
			.poll(async () => (await readBridgeStore(page)).state, { timeout: 8_000 })
			.toBe('connected');
		await expect
			.poll(async () => (await readCurrentSong(page))?.id, { timeout: 5_000 })
			.toBe(SONG_ID);

		const snap = (await readCurrentSong(page)) as
			| { sections?: Array<{ id: string; name: string; startBar: number; endBar: number }> }
			| null;
		const sec = snap?.sections?.find((s) => s.id === 'sec-long');
		expect(sec).toBeTruthy();
		expect(sec?.name).toBe(LONG_NAME);
		expect(sec?.name?.length).toBeGreaterThanOrEqual(200);
		expect(sec?.startBar).toBe(1);
		expect(sec?.endBar).toBe(4);
	});
});
