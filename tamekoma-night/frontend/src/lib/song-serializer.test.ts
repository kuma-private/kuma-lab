import { describe, expect, it } from 'vitest';
import { hydrateSong, serializeSong, deserializeSong, mergeParsedSong } from './song-serializer';
import type { Song } from '$lib/types/song';

function baseSong(): Song {
	return {
		id: 'song-1',
		title: 'Test',
		bpm: 100,
		timeSignature: '4/4',
		key: 'C Major',
		chordProgression: '| C | F | G | C |',
		sections: [],
		tracks: [
			{
				id: 'track-1',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: 0,
				mute: false,
				solo: false
			}
		],
		createdBy: 'u',
		createdAt: '2024-01-01',
		lastEditedAt: '2024-01-01'
	};
}

describe('hydrateSong', () => {
	it('fills Bridge-optional fields with defaults on a legacy song', () => {
		const s = baseSong();
		const h = hydrateSong(s);
		expect(h.buses).toEqual([]);
		expect(h.master).toEqual({ chain: [], volume: 1 });
		expect(h.tracks[0].chain).toEqual([]);
		expect(h.tracks[0].sends).toEqual([]);
		expect(h.tracks[0].pan).toBe(0);
		expect(h.tracks[0].automation).toEqual([]);
	});

	it('preserves existing Bridge fields when present', () => {
		const s = baseSong();
		s.buses = [{ id: 'b1', name: 'Reverb', chain: [], sends: [], volume: 0.5, pan: 0 }];
		s.master = { chain: [], volume: 0.8 };
		s.tracks[0].chain = [
			{
				id: 'n1',
				kind: 'instrument',
				plugin: { format: 'builtin', uid: 'sine', name: 'Sine' },
				bypass: false,
				params: {}
			}
		];
		s.tracks[0].pan = -0.5;
		const h = hydrateSong(s);
		expect(h.buses).toHaveLength(1);
		expect(h.master?.volume).toBe(0.8);
		expect(h.tracks[0].chain).toHaveLength(1);
		expect(h.tracks[0].pan).toBe(-0.5);
		expect(h.tracks[0].sends).toEqual([]);
		expect(h.tracks[0].automation).toEqual([]);
	});

	it('does not mutate the input', () => {
		const s = baseSong();
		const before = JSON.stringify(s);
		hydrateSong(s);
		expect(JSON.stringify(s)).toBe(before);
	});
});

describe('serialize / deserialize round-trip (legacy fields only)', () => {
	it('preserves title/bpm/key/time/chords/tracks', () => {
		const s = baseSong();
		s.tracks[0].blocks.push({
			id: 'b1',
			startBar: 0,
			endBar: 4,
			directives: '@mode: arpUp\n@velocity: mf'
		});
		const text = serializeSong(s);
		const parsed = deserializeSong(text);
		expect(parsed.errors).toEqual([]);
		const merged = mergeParsedSong(s, parsed.song);
		expect(merged.title).toBe(s.title);
		expect(merged.bpm).toBe(s.bpm);
		expect(merged.key).toBe(s.key);
		expect(merged.timeSignature).toBe(s.timeSignature);
		expect(merged.chordProgression.trim()).toBe(s.chordProgression.trim());
		expect(merged.tracks[0].name).toBe('Piano');
		expect(merged.tracks[0].blocks[0].directives.trim()).toBe('@mode: arpUp\n@velocity: mf');
	});
});
