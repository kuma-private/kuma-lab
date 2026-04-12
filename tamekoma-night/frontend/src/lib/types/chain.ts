// Cadenza Bridge chain / mixer / automation data model.
// All fields are additive — a Song loaded without these still works.

export type PluginFormat = 'vst3' | 'clap' | 'builtin';

export interface PluginRef {
	format: PluginFormat;
	uid: string;        // URI or plugin path
	name: string;
	vendor?: string;
}

export type ChainNodeKind = 'instrument' | 'insert' | 'bus';

export interface ChainNode {
	id: string;
	kind: ChainNodeKind;
	plugin: PluginRef;
	bypass: boolean;
	params: Record<string, number>;
	/** Base64 opaque plugin state blob */
	stateBlob?: string;
}

export interface Send {
	id: string;
	destBusId: string;
	level: number;
	pre: boolean;
}

export type AutomationCurve = 'linear' | 'hold' | 'bezier';

export interface AutomationPoint {
	tick: number;
	value: number;
	curve?: AutomationCurve;
}

export interface Automation {
	nodeId: string;
	paramId: string;
	points: AutomationPoint[];
}

export interface Bus {
	id: string;
	name: string;
	chain: ChainNode[];
	sends: Send[];
	volume: number;
	pan: number;
}

export interface Master {
	chain: ChainNode[];
	volume: number;
}
