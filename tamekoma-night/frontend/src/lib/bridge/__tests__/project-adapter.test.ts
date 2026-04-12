import { describe, expect, it } from 'vitest';
import {
	PPQ,
	secondsToTick,
	songToBridgeProject,
	tickToSeconds
} from '../project-adapter';
import type { MidiNote, Song } from '$lib/types/song';

function makeSong(): Song {
	return {
		id: 'song-1',
		title: 'Test',
		bpm: 120,
		timeSignature: '3/4',
		key: 'C Major',
		chordProgression: '',
		sections: [],
		tracks: [
			{
				id: 'track-piano',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: -3,
				mute: false,
				solo: false,
				pan: 0.25
			},
			{
				id: 'track-bass',
				name: 'Bass',
				instrument: 'bass',
				blocks: [],
				volume: 0,
				mute: true,
				solo: false
			}
		],
		createdBy: 'u',
		createdAt: '',
		lastEditedAt: ''
	};
}

const NOTES_PIANO: MidiNote[] = [
	{ midi: 60, startTick: 0, durationTicks: 480, velocity: 90, channel: 0 },
	{ midi: 64, startTick: 480, durationTicks: 480, velocity: 80, channel: 0 },
	{ midi: 67, startTick: 960, durationTicks: 240, velocity: 70, channel: 0 }
];

const NOTES_BASS: MidiNote[] = [
	{ midi: 36, startTick: 0, durationTicks: 1920, velocity: 100, channel: 1 }
];

describe('songToBridgeProject', () => {
	it('maps song metadata to BridgeProject fields', () => {
		const notes = new Map<string, MidiNote[]>();
		notes.set('track-piano', NOTES_PIANO);
		notes.set('track-bass', NOTES_BASS);

		const project = songToBridgeProject(makeSong(), notes);

		expect(project.version).toBe('0.1');
		expect(project.bpm).toBe(120);
		expect(project.timeSignature).toEqual([3, 4]);
		expect(project.sampleRate).toBe(48_000);
		expect(project.tracks).toHaveLength(2);
	});

	it('bundles each track into one clip with correct length and notes', () => {
		const notes = new Map<string, MidiNote[]>();
		notes.set('track-piano', NOTES_PIANO);
		notes.set('track-bass', NOTES_BASS);

		const project = songToBridgeProject(makeSong(), notes);

		const piano = project.tracks[0];
		expect(piano.id).toBe('track-piano');
		expect(piano.name).toBe('Piano');
		expect(piano.instrument).toBeNull();
		expect(piano.volumeDb).toBe(-3);
		expect(piano.pan).toBe(0.25);
		expect(piano.mute).toBe(false);
		expect(piano.clips).toHaveLength(1);

		const clip = piano.clips[0];
		expect(clip.id).toBe('track-piano:clip0');
		expect(clip.startTick).toBe(0);
		expect(clip.lengthTicks).toBe(1200); // 960 + 240
		expect(clip.notes).toHaveLength(3);
		expect(clip.notes[0]).toEqual({
			pitch: 60,
			velocity: 90,
			startTick: 0,
			lengthTicks: 480
		});

		const bass = project.tracks[1];
		expect(bass.mute).toBe(true);
		expect(bass.clips[0].lengthTicks).toBe(1920);
		expect(bass.clips[0].notes[0].pitch).toBe(36);
	});

	it('returns an empty clip when a track has no generated notes', () => {
		const project = songToBridgeProject(makeSong(), new Map());
		expect(project.tracks[0].clips[0].notes).toEqual([]);
		expect(project.tracks[0].clips[0].lengthTicks).toBe(0);
	});

	it('falls back to 4/4 for malformed timeSignature', () => {
		const song = makeSong();
		song.timeSignature = 'garbage';
		const project = songToBridgeProject(song, new Map());
		expect(project.timeSignature).toEqual([4, 4]);
	});

	it('falls back to bpm 120 when bpm is 0', () => {
		const song = makeSong();
		song.bpm = 0;
		const project = songToBridgeProject(song, new Map());
		expect(project.bpm).toBe(120);
	});
});

describe('tick conversion helpers', () => {
	it('tickToSeconds: 1 quarter @ 120 bpm = 0.5s', () => {
		expect(tickToSeconds(PPQ, 120)).toBeCloseTo(0.5, 6);
	});

	it('tickToSeconds: 2 quarters @ 60 bpm = 2s', () => {
		expect(tickToSeconds(PPQ * 2, 60)).toBeCloseTo(2.0, 6);
	});

	it('secondsToTick is the inverse of tickToSeconds', () => {
		const tick = 1234;
		const sec = tickToSeconds(tick, 140);
		expect(secondsToTick(sec, 140)).toBe(tick);
	});
});
