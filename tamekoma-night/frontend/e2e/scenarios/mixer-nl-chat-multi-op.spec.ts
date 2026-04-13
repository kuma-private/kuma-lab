// Mixer NL chat with a mocked multi-op suggestion (volume + send + chain
// add). Verifies the assistant bubble + Apply path lands all ops in one
// call, not just the first.

import { test, expect } from '../fixtures/full-stack';
import { readBridgeStore, readCurrentSong } from '../fixtures/window-stores';
import type { Song, SongListItem } from '../../src/lib/types/song';

const SONG_ID = 'song-nl-chat-multi';

function makeSong(): Song {
	const now = new Date().toISOString();
	return {
		id: SONG_ID,
		title: 'NL Chat Multi',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '| C |',
		sections: [{ id: 'sec1', name: 'A', startBar: 1, endBar: 1 }],
		tracks: [
			{
				id: 'track-bass',
				name: 'Bass',
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
		buses: [
			{
				id: 'bus-fx',
				name: 'FX',
				chain: [],
				sends: [],
				volume: 0,
				pan: 0
			}
		],
		master: { chain: [], volume: 1 }
	};
}

test.describe('Mixer NL chat — multi-op apply', () => {
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
		await page.route('**/api/mixer/suggest', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					explanation: 'Bass を -3dB に下げて、FX バスへ 0.4 でセンド、Filter インサートを追加',
					ops: [
						{ op: 'replace', path: '/tracks/track-bass/volumeDb', value: -3 },
						{
							op: 'add',
							path: '/tracks/track-bass/sends/-',
							value: {
								id: 'send-x',
								destBusId: 'bus-fx',
								level: 0.4,
								pre: false
							}
						},
						{
							op: 'add',
							path: '/tracks/track-bass/chain/-',
							value: {
								id: 'svf-1',
								kind: 'insert',
								plugin: { format: 'builtin', uid: 'svf', name: 'Filter', vendor: 'Cadenza' },
								bypass: false,
								params: { cutoff: 1500 }
							}
						}
					],
					sideEffects: []
				})
			})
		);
	});

	test('multi-op suggest → Apply lands volume + send + chain insert', async ({
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
		const promptInput = page.getByLabel('プロンプト');
		await promptInput.fill('Bass を整えて');
		await page.getByRole('button', { name: '送信' }).click();

		await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible({
			timeout: 5_000
		});
		await page.getByRole('button', { name: 'Apply' }).click();

		await expect
			.poll(
				async () => {
					const snap = await readCurrentSong(page);
					const t = snap?.tracks.find((x) => x.id === 'track-bass') as
						| {
								volume?: number;
								sends?: Array<{ destBusId: string }>;
								chain?: Array<{ plugin?: { uid?: string } }>;
						  }
						| undefined;
					return {
						volume: t?.volume ?? null,
						sends: t?.sends?.length ?? 0,
						chain: t?.chain?.length ?? 0,
						chainUid: t?.chain?.[0]?.plugin?.uid ?? null
					};
				},
				{ timeout: 5_000 }
			)
			.toMatchObject({ volume: -3, sends: 1, chain: 1, chainUid: 'svf' });
	});
});
