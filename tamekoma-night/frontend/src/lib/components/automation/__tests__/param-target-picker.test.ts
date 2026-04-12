// ParamTargetPicker tests — exercise the candidate enumeration logic that the
// component uses to list available (nodeId, paramId) pairs on a track's chain.

import { describe, expect, it } from 'vitest';
import type { Track } from '$lib/types/song';
import { descriptorForPlugin } from '$lib/components/mixer/plugin-descriptors';

function makeTrack(chain: Track['chain']): Track {
	return {
		id: 't-demo',
		name: 'Demo',
		instrument: 'piano',
		blocks: [],
		volume: 0,
		mute: false,
		solo: false,
		chain,
		sends: [],
		pan: 0,
		automation: []
	};
}

interface Candidate {
	nodeId: string;
	nodeName: string;
	paramId: string;
	paramLabel: string;
}

/**
 * Mirror the derivation in ParamTargetPicker.svelte so we can exercise it as a
 * pure function.
 */
function candidatesFor(track: Track): Candidate[] {
	const list: Candidate[] = [];
	const chain = track.chain ?? [];
	for (const node of chain) {
		const desc = descriptorForPlugin(node.plugin);
		if (!desc) continue;
		for (const p of desc.params) {
			if (p.kind !== 'number') continue;
			list.push({
				nodeId: node.id,
				nodeName: node.plugin.name,
				paramId: p.id,
				paramLabel: p.label
			});
		}
	}
	return list;
}

describe('ParamTargetPicker candidate enumeration', () => {
	it('empty chain → no candidates', () => {
		const t = makeTrack([]);
		expect(candidatesFor(t)).toEqual([]);
	});

	it('built-in gain → gainDb candidate', () => {
		const t = makeTrack([
			{
				id: 'gain-1',
				kind: 'insert',
				plugin: { format: 'builtin', uid: 'gain', name: 'Gain' },
				bypass: false,
				params: {}
			}
		]);
		const list = candidatesFor(t);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			nodeId: 'gain-1',
			nodeName: 'Gain',
			paramId: 'gainDb',
			paramLabel: 'Gain'
		});
	});

	it('built-in svf → only number params (mode enum is excluded)', () => {
		const t = makeTrack([
			{
				id: 'svf-a',
				kind: 'insert',
				plugin: { format: 'builtin', uid: 'svf', name: 'Filter' },
				bypass: false,
				params: {}
			}
		]);
		const list = candidatesFor(t);
		expect(list.map((c) => c.paramId)).toEqual(['cutoff', 'resonance']);
		expect(list.every((c) => c.nodeId === 'svf-a')).toBe(true);
	});

	it('built-in compressor → threshold/ratio/attack/release all numeric', () => {
		const t = makeTrack([
			{
				id: 'comp-1',
				kind: 'insert',
				plugin: { format: 'builtin', uid: 'compressor', name: 'Compressor' },
				bypass: false,
				params: {}
			}
		]);
		const ids = candidatesFor(t).map((c) => c.paramId);
		expect(ids).toEqual(['thresholdDb', 'ratio', 'attackMs', 'releaseMs']);
	});

	it('multiple nodes in chain → candidates are grouped by node order', () => {
		const t = makeTrack([
			{
				id: 'g1',
				kind: 'insert',
				plugin: { format: 'builtin', uid: 'gain', name: 'Gain' },
				bypass: false,
				params: {}
			},
			{
				id: 'f1',
				kind: 'insert',
				plugin: { format: 'builtin', uid: 'svf', name: 'Filter' },
				bypass: false,
				params: {}
			}
		]);
		const list = candidatesFor(t);
		expect(list.map((c) => c.nodeId)).toEqual(['g1', 'f1', 'f1']);
		expect(list.map((c) => c.paramId)).toEqual(['gainDb', 'cutoff', 'resonance']);
	});

	it('VST3 / CLAP nodes without a descriptor produce no candidates', () => {
		const t = makeTrack([
			{
				id: 'ext-1',
				kind: 'insert',
				plugin: { format: 'vst3', uid: 'file:///foo.vst3', name: 'Foo' },
				bypass: false,
				params: {}
			}
		]);
		expect(candidatesFor(t)).toEqual([]);
	});
});