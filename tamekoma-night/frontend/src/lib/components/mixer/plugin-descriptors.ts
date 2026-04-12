// Built-in plugin descriptors — param metadata for the ParamPopover.
// Phase 5 does not query the Bridge for descriptors, so built-ins are hard-coded.
// Keep ids in sync with `cadenza-bridge/crates/bridge-plugin-host` built-ins.

import type { PluginRef } from '$lib/types/chain';
import type { Song } from '$lib/types/song';

export type ParamKind = 'number' | 'enum';

export interface NumberParamDescriptor {
	id: string;
	label: string;
	kind: 'number';
	min: number;
	max: number;
	step?: number;
	default: number;
	unit?: string;
}

export interface EnumParamDescriptor {
	id: string;
	label: string;
	kind: 'enum';
	options: { value: number; label: string }[];
	default: number;
}

export type ParamDescriptor = NumberParamDescriptor | EnumParamDescriptor;

export interface PluginDescriptor {
	pluginId: string; // matches PluginRef.uid for built-ins
	name: string;
	params: ParamDescriptor[];
}

export type BuiltinKind = 'instrument' | 'effect';

export interface PluginDescriptorMeta extends PluginDescriptor {
	kind: BuiltinKind;
}

export const BUILTIN_DESCRIPTORS: Record<string, PluginDescriptorMeta> = {
	// ── Effects ──
	gain: {
		pluginId: 'gain',
		name: 'Gain',
		kind: 'effect',
		params: [
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: 0, unit: 'dB' }
		]
	},
	svf: {
		pluginId: 'svf',
		name: 'Filter',
		kind: 'effect',
		params: [
			{ id: 'cutoff', label: 'Cutoff', kind: 'number', min: 20, max: 20000, step: 1, default: 1000, unit: 'Hz' },
			{ id: 'resonance', label: 'Resonance', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
			{
				id: 'mode',
				label: 'Mode',
				kind: 'enum',
				options: [
					{ value: 0, label: 'Low Pass' },
					{ value: 1, label: 'High Pass' },
					{ value: 2, label: 'Band Pass' }
				],
				default: 0
			}
		]
	},
	compressor: {
		pluginId: 'compressor',
		name: 'Compressor',
		kind: 'effect',
		params: [
			{ id: 'thresholdDb', label: 'Threshold', kind: 'number', min: -60, max: 0, step: 0.1, default: -20, unit: 'dB' },
			{ id: 'ratio', label: 'Ratio', kind: 'number', min: 1, max: 20, step: 0.1, default: 4 },
			{ id: 'attackMs', label: 'Attack', kind: 'number', min: 0.1, max: 100, step: 0.1, default: 10, unit: 'ms' },
			{ id: 'releaseMs', label: 'Release', kind: 'number', min: 10, max: 1000, step: 1, default: 100, unit: 'ms' }
		]
	},
	delay: {
		pluginId: 'delay',
		name: 'Delay',
		kind: 'effect',
		params: [
			{ id: 'timeMs', label: 'Time', kind: 'number', min: 1, max: 2000, step: 1, default: 350, unit: 'ms' },
			{ id: 'feedback', label: 'Feedback', kind: 'number', min: 0, max: 0.95, step: 0.01, default: 0.4 },
			{ id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
			{
				id: 'pingPong',
				label: 'Ping Pong',
				kind: 'enum',
				options: [
					{ value: 0, label: 'Off' },
					{ value: 1, label: 'On' }
				],
				default: 0
			}
		]
	},
	reverb: {
		pluginId: 'reverb',
		name: 'Reverb',
		kind: 'effect',
		params: [
			{ id: 'roomSize', label: 'Room Size', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
			{ id: 'damping', label: 'Damping', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
			{ id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
			{ id: 'width', label: 'Width', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
		]
	},
	saturation: {
		pluginId: 'saturation',
		name: 'Saturation',
		kind: 'effect',
		params: [
			{ id: 'drive', label: 'Drive', kind: 'number', min: 0, max: 24, step: 0.1, default: 6, unit: 'dB' },
			{ id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 1 }
		]
	},
	// ── Instruments ──
	sine: {
		pluginId: 'sine',
		name: 'Sine Synth',
		kind: 'instrument',
		params: [
			{ id: 'attack', label: 'Attack', kind: 'number', min: 0, max: 5000, step: 1, default: 5, unit: 'ms' },
			{ id: 'decay', label: 'Decay', kind: 'number', min: 0, max: 5000, step: 1, default: 200, unit: 'ms' },
			{ id: 'sustain', label: 'Sustain', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
			{ id: 'release', label: 'Release', kind: 'number', min: 0, max: 5000, step: 1, default: 300, unit: 'ms' },
			{ id: 'detune', label: 'Detune', kind: 'number', min: -100, max: 100, step: 1, default: 0, unit: 'cents' },
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: 0, unit: 'dB' }
		]
	},
	supersaw: {
		pluginId: 'supersaw',
		name: 'Super Saw',
		kind: 'instrument',
		params: [
			{ id: 'attack', label: 'Attack', kind: 'number', min: 0, max: 5000, step: 1, default: 10, unit: 'ms' },
			{ id: 'decay', label: 'Decay', kind: 'number', min: 0, max: 5000, step: 1, default: 300, unit: 'ms' },
			{ id: 'sustain', label: 'Sustain', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
			{ id: 'release', label: 'Release', kind: 'number', min: 0, max: 5000, step: 1, default: 400, unit: 'ms' },
			{ id: 'detune', label: 'Detune', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
			{ id: 'mix', label: 'Mix', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
			{ id: 'cutoff', label: 'Cutoff', kind: 'number', min: 20, max: 20000, step: 1, default: 4000, unit: 'Hz' },
			{ id: 'resonance', label: 'Resonance', kind: 'number', min: 0, max: 0.99, step: 0.01, default: 0.4 },
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: -6, unit: 'dB' }
		]
	},
	subbass: {
		pluginId: 'subbass',
		name: 'Sub Bass',
		kind: 'instrument',
		params: [
			{ id: 'attack', label: 'Attack', kind: 'number', min: 0, max: 5000, step: 1, default: 5, unit: 'ms' },
			{ id: 'decay', label: 'Decay', kind: 'number', min: 0, max: 5000, step: 1, default: 200, unit: 'ms' },
			{ id: 'sustain', label: 'Sustain', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.85 },
			{ id: 'release', label: 'Release', kind: 'number', min: 0, max: 5000, step: 1, default: 200, unit: 'ms' },
			{ id: 'drive', label: 'Drive', kind: 'number', min: 0.5, max: 10, step: 0.1, default: 2.5 },
			{ id: 'subOctaveMix', label: 'Sub Octave', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: -3, unit: 'dB' }
		]
	},
	drumkit: {
		pluginId: 'drumkit',
		name: 'Drum Kit',
		kind: 'instrument',
		params: [
			{ id: 'kickPitch', label: 'Kick Pitch', kind: 'number', min: 30, max: 200, step: 1, default: 60, unit: 'Hz' },
			{ id: 'kickDecay', label: 'Kick Decay', kind: 'number', min: 20, max: 800, step: 1, default: 220, unit: 'ms' },
			{ id: 'snareTone', label: 'Snare Tone', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
			{ id: 'hatDecay', label: 'Hat Decay', kind: 'number', min: 5, max: 800, step: 1, default: 50, unit: 'ms' },
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: -3, unit: 'dB' }
		]
	}
};

/** Return the descriptor for a PluginRef, or null if unknown. */
export function descriptorForPlugin(plugin: PluginRef): PluginDescriptorMeta | null {
	if (plugin.format !== 'builtin') return null;
	return BUILTIN_DESCRIPTORS[plugin.uid] ?? null;
}

/** Return all built-ins of the given kind (used by the picker tabs). */
export function builtinsByKind(kind: BuiltinKind): PluginDescriptorMeta[] {
	return Object.values(BUILTIN_DESCRIPTORS).filter((d) => d.kind === kind);
}

/** Build a new PluginRef for a built-in by id. */
export function makeBuiltinRef(id: string): PluginRef {
	const desc = BUILTIN_DESCRIPTORS[id];
	return {
		format: 'builtin',
		uid: id,
		name: desc?.name ?? id,
		vendor: 'Cadenza'
	};
}

// ── Mixer snapshot (for /api/mixer/suggest) ─────────────────

export interface MixerSnapshot {
	tracks: {
		id: string;
		name: string;
		volume: number;
		pan: number;
		mute: boolean;
		solo: boolean;
		chain: NonNullable<Song['tracks'][number]['chain']>;
		sends: NonNullable<Song['tracks'][number]['sends']>;
	}[];
	buses: NonNullable<Song['buses']>;
	master: NonNullable<Song['master']>;
}

/**
 * Extract only the mixer-relevant fields from a song so the AI assistant gets
 * a compact view and can return JSON Patch ops against it.
 */
export function extractMixerSnapshot(song: Song): MixerSnapshot {
	return {
		tracks: song.tracks.map((t) => ({
			id: t.id,
			name: t.name,
			volume: t.volume,
			pan: t.pan ?? 0,
			mute: t.mute,
			solo: t.solo,
			chain: t.chain ?? [],
			sends: t.sends ?? []
		})),
		buses: song.buses ?? [],
		master: song.master ?? { chain: [], volume: 1 }
	};
}
