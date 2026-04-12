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

export const BUILTIN_DESCRIPTORS: Record<string, PluginDescriptor> = {
	gain: {
		pluginId: 'gain',
		name: 'Gain',
		params: [
			{ id: 'gainDb', label: 'Gain', kind: 'number', min: -60, max: 12, step: 0.1, default: 0, unit: 'dB' }
		]
	},
	svf: {
		pluginId: 'svf',
		name: 'Filter',
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
		params: [
			{ id: 'thresholdDb', label: 'Threshold', kind: 'number', min: -60, max: 0, step: 0.1, default: -20, unit: 'dB' },
			{ id: 'ratio', label: 'Ratio', kind: 'number', min: 1, max: 20, step: 0.1, default: 4 },
			{ id: 'attackMs', label: 'Attack', kind: 'number', min: 0.1, max: 100, step: 0.1, default: 10, unit: 'ms' },
			{ id: 'releaseMs', label: 'Release', kind: 'number', min: 10, max: 1000, step: 1, default: 100, unit: 'ms' }
		]
	}
};

/** Return the descriptor for a PluginRef, or null if unknown. */
export function descriptorForPlugin(plugin: PluginRef): PluginDescriptor | null {
	if (plugin.format !== 'builtin') return null;
	return BUILTIN_DESCRIPTORS[plugin.uid] ?? null;
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
