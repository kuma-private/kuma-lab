import { describe, expect, it } from 'vitest';
import type { Song } from '$lib/types/song';
import {
	BUILTIN_DESCRIPTORS,
	descriptorForPlugin,
	extractMixerSnapshot,
	makeBuiltinRef
} from '../plugin-descriptors';

describe('plugin-descriptors — built-in catalog', () => {
	it('exposes gain/svf/compressor built-ins', () => {
		expect(BUILTIN_DESCRIPTORS.gain).toBeDefined();
		expect(BUILTIN_DESCRIPTORS.svf).toBeDefined();
		expect(BUILTIN_DESCRIPTORS.compressor).toBeDefined();
	});

	it('gain has a single gainDb parameter in dB', () => {
		const desc = BUILTIN_DESCRIPTORS.gain;
		expect(desc.params).toHaveLength(1);
		expect(desc.params[0].id).toBe('gainDb');
		if (desc.params[0].kind === 'number') {
			expect(desc.params[0].unit).toBe('dB');
			expect(desc.params[0].min).toBe(-60);
			expect(desc.params[0].max).toBe(12);
		}
	});

	it('svf exposes cutoff/resonance/mode with mode as enum', () => {
		const desc = BUILTIN_DESCRIPTORS.svf;
		expect(desc.params.map((p) => p.id)).toEqual(['cutoff', 'resonance', 'mode']);
		const mode = desc.params.find((p) => p.id === 'mode');
		expect(mode?.kind).toBe('enum');
		if (mode?.kind === 'enum') {
			expect(mode.options).toHaveLength(3);
			expect(mode.options.map((o) => o.label)).toEqual(['Low Pass', 'High Pass', 'Band Pass']);
		}
	});

	it('compressor exposes threshold/ratio/attack/release', () => {
		const desc = BUILTIN_DESCRIPTORS.compressor;
		expect(desc.params.map((p) => p.id)).toEqual([
			'thresholdDb',
			'ratio',
			'attackMs',
			'releaseMs'
		]);
	});
});

describe('descriptorForPlugin', () => {
	it('returns descriptor for known built-in ids', () => {
		const d = descriptorForPlugin({ format: 'builtin', uid: 'gain', name: 'Gain' });
		expect(d).not.toBeNull();
		expect(d?.pluginId).toBe('gain');
	});

	it('returns null for unknown built-in id', () => {
		expect(descriptorForPlugin({ format: 'builtin', uid: 'unknown', name: 'X' })).toBeNull();
	});

	it('returns null for non-builtin formats', () => {
		expect(
			descriptorForPlugin({ format: 'vst3', uid: 'file:///foo.vst3', name: 'Foo' })
		).toBeNull();
		expect(
			descriptorForPlugin({ format: 'clap', uid: 'file:///foo.clap', name: 'Foo' })
		).toBeNull();
	});
});

describe('makeBuiltinRef', () => {
	it('builds a PluginRef from a built-in id', () => {
		const ref = makeBuiltinRef('compressor');
		expect(ref.format).toBe('builtin');
		expect(ref.uid).toBe('compressor');
		expect(ref.name).toBe('Compressor');
		expect(ref.vendor).toBe('Cadenza');
	});

	it('falls back to id for unknown built-ins', () => {
		const ref = makeBuiltinRef('unknown-x');
		expect(ref.name).toBe('unknown-x');
	});
});

// ── extractMixerSnapshot ────────────────────────────────

function makeSong(): Song {
	return {
		id: 's',
		title: 'T',
		bpm: 120,
		timeSignature: '4/4',
		key: 'C',
		chordProgression: '',
		sections: [],
		createdBy: '',
		createdAt: '',
		lastEditedAt: '',
		tracks: [
			{
				id: 't1',
				name: 'Piano',
				instrument: 'piano',
				blocks: [],
				volume: -3,
				mute: false,
				solo: false,
				pan: 0.2,
				chain: [
					{
						id: 'n1',
						kind: 'insert',
						plugin: { format: 'builtin', uid: 'gain', name: 'Gain' },
						bypass: false,
						params: { gainDb: -3 }
					}
				],
				sends: [{ id: 's1', destBusId: 'bus-a', level: 0.4, pre: false }]
			},
			{
				id: 't2',
				name: 'Bass',
				instrument: 'bass',
				blocks: [],
				volume: 0,
				mute: true,
				solo: false
				// chain / sends / pan intentionally absent
			}
		],
		buses: [{ id: 'bus-a', name: 'Reverb Bus', chain: [], sends: [], volume: 0, pan: 0 }],
		master: { chain: [], volume: 0.9 }
	};
}

describe('extractMixerSnapshot', () => {
	it('copies tracks with mixer-relevant fields only', () => {
		const snap = extractMixerSnapshot(makeSong());
		expect(snap.tracks).toHaveLength(2);
		expect(snap.tracks[0]).toMatchObject({
			id: 't1',
			name: 'Piano',
			volume: -3,
			pan: 0.2,
			mute: false,
			solo: false
		});
		expect(snap.tracks[0].chain).toHaveLength(1);
		expect(snap.tracks[0].sends).toHaveLength(1);
		// No 'blocks' key in snapshot
		expect('blocks' in snap.tracks[0]).toBe(false);
	});

	it('defaults missing chain/sends/pan to empty/zero', () => {
		const snap = extractMixerSnapshot(makeSong());
		expect(snap.tracks[1].chain).toEqual([]);
		expect(snap.tracks[1].sends).toEqual([]);
		expect(snap.tracks[1].pan).toBe(0);
	});

	it('copies buses and master', () => {
		const snap = extractMixerSnapshot(makeSong());
		expect(snap.buses).toHaveLength(1);
		expect(snap.buses[0].name).toBe('Reverb Bus');
		expect(snap.master.volume).toBe(0.9);
	});

	it('provides default master when absent', () => {
		const song = makeSong();
		delete song.master;
		delete song.buses;
		const snap = extractMixerSnapshot(song);
		expect(snap.master).toEqual({ chain: [], volume: 1 });
		expect(snap.buses).toEqual([]);
	});
});
