import { describe, expect, it, vi } from 'vitest';

// Mock MultiTrackPlayer before import.
const loadMock = vi.fn();
const playMock = vi.fn().mockResolvedValue(undefined);
const pauseMock = vi.fn();
const stopMock = vi.fn();
const seekMock = vi.fn();
const setVolumeMock = vi.fn();
const setTrackVolumeMock = vi.fn();
const setTrackMuteMock = vi.fn();
const setTrackSoloMock = vi.fn();
const getTrackNotesMock = vi.fn().mockReturnValue([]);
const getAllTrackNotesMock = vi.fn().mockReturnValue(new Map());
const disposeMock = vi.fn();

let capturedCallbacks: any = null;

vi.mock('$lib/multi-track-player', () => {
	return {
		MultiTrackPlayer: class {
			totalDuration = 42;
			constructor(cb: any) {
				capturedCallbacks = cb;
			}
			load = loadMock;
			play = playMock;
			pause = pauseMock;
			stop = stopMock;
			seekTo = seekMock;
			setVolume = setVolumeMock;
			setTrackVolume = setTrackVolumeMock;
			setTrackMute = setTrackMuteMock;
			setTrackSolo = setTrackSoloMock;
			getTrackNotes = getTrackNotesMock;
			getAllTrackNotes = getAllTrackNotesMock;
			dispose = disposeMock;
		}
	};
});

import { ToneEngine } from '../tone-engine';
import type { Song } from '$lib/types/song';

const FAKE_SONG: Song = {
	id: 's',
	title: 't',
	bpm: 120,
	timeSignature: '4/4',
	key: 'C',
	chordProgression: '',
	sections: [],
	tracks: [],
	createdBy: '',
	createdAt: '',
	lastEditedAt: ''
};

describe('ToneEngine adapter', () => {
	it('delegates all playback methods to MultiTrackPlayer', async () => {
		const e = new ToneEngine();
		expect(e.kind).toBe('tone');
		expect(e.totalDuration).toBe(42);

		await e.load(FAKE_SONG);
		expect(loadMock).toHaveBeenCalledWith(FAKE_SONG);

		await e.play();
		expect(playMock).toHaveBeenCalled();

		await e.pause();
		expect(pauseMock).toHaveBeenCalled();

		await e.stop();
		expect(stopMock).toHaveBeenCalled();

		await e.seekTo(2.5);
		expect(seekMock).toHaveBeenCalledWith(2.5);

		e.setVolume(-6);
		expect(setVolumeMock).toHaveBeenCalledWith(-6);

		e.setTrackVolume('t1', -3);
		expect(setTrackVolumeMock).toHaveBeenCalledWith('t1', -3);

		e.setTrackMute('t1', true);
		expect(setTrackMuteMock).toHaveBeenCalledWith('t1', true);

		e.setTrackSolo('t1', true);
		expect(setTrackSoloMock).toHaveBeenCalledWith('t1', true);

		e.getTrackNotes('t1');
		expect(getTrackNotesMock).toHaveBeenCalledWith('t1');

		e.getAllTrackNotes();
		expect(getAllTrackNotesMock).toHaveBeenCalled();

		e.dispose();
		expect(disposeMock).toHaveBeenCalled();
	});

	it('forwards MultiTrackPlayer callbacks to engine callbacks', () => {
		const e = new ToneEngine();
		const onState = vi.fn();
		const onProgress = vi.fn();
		const onBar = vi.fn();
		const onChord = vi.fn();
		e.onStateChange = onState;
		e.onProgress = onProgress;
		e.onBarChange = onBar;
		e.onChordChange = onChord;

		capturedCallbacks.onStateChange('playing');
		capturedCallbacks.onProgress(1.5, 10);
		capturedCallbacks.onBarChange(3);
		capturedCallbacks.onChordChange('Am7');

		expect(onState).toHaveBeenCalledWith('playing');
		expect(onProgress).toHaveBeenCalledWith(1.5, 10);
		expect(onBar).toHaveBeenCalledWith(3);
		expect(onChord).toHaveBeenCalledWith('Am7');
	});
});
