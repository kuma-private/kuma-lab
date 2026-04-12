import type { Automation, Bus, ChainNode, Master, PluginRef, Send } from './chain';

export interface Song {
	id: string;
	title: string;
	bpm: number;
	timeSignature: string;       // "4/4"
	key: string;                 // "C Major"
	chordProgression: string;    // rechord notation (master)
	sections: Section[];
	tracks: Track[];
	createdBy: string;
	createdAt: string;
	lastEditedAt: string;
	// Bridge extensions (optional, additive)
	buses?: Bus[];
	master?: Master;
}

/** List API returns summary with counts instead of full arrays */
export interface SongListItem {
	id: string;
	title: string;
	bpm: number;
	timeSignature: string;
	key: string;
	createdByName: string;
	createdAt: string;
	lastEditedBy: string;
	lastEditedAt: string;
	trackCount: number;
	sectionCount: number;
	visibility: string;
}

export interface Section {
	id: string;
	name: string;                // "A", "Chorus"
	startBar: number;            // 0-based, inclusive
	endBar: number;              // exclusive
	color?: string;
}

export interface Track {
	id: string;
	name: string;                // "Piano", "Bass"
	instrument: string;          // "piano", "bass", "drums", "strings", "guitar", "organ"
	blocks: DirectiveBlock[];
	volume: number;              // dB
	mute: boolean;
	solo: boolean;
	// Bridge extensions (optional, additive)
	chain?: ChainNode[];
	sends?: Send[];
	pan?: number;
	automation?: Automation[];
	/**
	 * Bridge instrument plugin (built-in or third-party). When set, the
	 * Bridge routes this track's MIDI through the chosen plugin instead
	 * of falling back to silence. Independent from the legacy `instrument`
	 * string above which drives in-browser Tone.js playback.
	 */
	instrumentPlugin?: PluginRef;
}

export interface DirectiveBlock {
	id: string;
	startBar: number;            // 0-based, inclusive
	endBar: number;              // exclusive
	directives: string;          // raw text: "@mode: arpUp\n@velocity: mf"
	generatedMidi?: GeneratedMidiData;  // AI生成MIDIデータ（オプション）
}

export interface GeneratedMidiData {
	notes: MidiNote[];
	style: string;
	expression: number;          // 0-100
	feel: number;                // 0-100
	generatedAt: string;         // ISO 8601
}

export interface GeneratedBlockMidi {
	blockId: string;
	notes: MidiNote[];
	sourceHash: string;          // input text hash for cache invalidation
}

export interface MidiNote {
	midi: number;                // 0-127
	startTick: number;           // 480 ticks/quarter
	durationTicks: number;
	velocity: number;            // 0-127
	channel: number;             // per track
}

export const createSection = (name: string, startBar: number, endBar: number): Section => ({
	id: crypto.randomUUID(),
	name,
	startBar,
	endBar,
});

export const createDirectiveBlock = (startBar: number, endBar: number, directives?: string): DirectiveBlock => ({
	id: crypto.randomUUID(),
	startBar,
	endBar,
	directives: directives ?? '',
});

export const createTrack = (name: string, instrument: string): Track => ({
	id: crypto.randomUUID(),
	name,
	instrument,
	blocks: [],
	volume: 0,
	mute: false,
	solo: false,
});

export const createDefaultSong = (title: string): Song => {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		title,
		bpm: 120,
		timeSignature: '4/4',
		key: 'C Major',
		chordProgression: '',
		sections: [],
		tracks: [createTrack('Piano', 'piano')],
		createdBy: '',
		createdAt: now,
		lastEditedAt: now,
	};
};
