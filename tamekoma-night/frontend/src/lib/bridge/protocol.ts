// Cadenza Bridge wire protocol — mirror of cadenza-bridge/crates/bridge-protocol

export const BRIDGE_PROTOCOL_VERSION = '0.1' as const;
export const BRIDGE_PORT_RANGE = [
	7890, 7891, 7892, 7893, 7894, 7895, 7896, 7897, 7898, 7899
] as const;
export const DEFAULT_RPC_TIMEOUT_MS = 5000;

// ── Outgoing (browser → Bridge) ─────────────────────────

export interface RequestEnvelope {
	kind: 'request';
	id: string;
	command: Command;
}

export type Command =
	| { type: 'handshake'; version: string }
	| { type: 'debug.sine'; on: boolean }
	| { type: 'plugins.scan' }
	| { type: 'plugins.list' }
	| { type: 'project.load'; project: BridgeProject }
	| { type: 'project.patch'; ops: JsonPatchOp[] }
	| { type: 'transport.play'; fromTick?: number }
	| { type: 'transport.stop' }
	| { type: 'transport.seek'; tick: number }
	| { type: 'midi.noteOn'; trackId: string; pitch: number; velocity: number }
	| { type: 'midi.noteOff'; trackId: string; pitch: number };

// ── Incoming (Bridge → browser) ─────────────────────────

export type ResponseEnvelope =
	| { kind: 'response'; id: string; ok: true; result: unknown }
	| { kind: 'response'; id: string; ok: false; error: BridgeErrorBody };

export interface EventEnvelope {
	kind: 'event';
	event: BridgeEvent;
}

export type IncomingMessage = ResponseEnvelope | EventEnvelope;

export interface BridgeErrorBody {
	code: string;
	message: string;
}

export type BridgeEvent =
	| {
			type: 'handshake.ack';
			bridgeVersion: string;
			capabilities: string[];
			updateAvailable: boolean;
	  }
	| { type: 'transport.position'; tick: number; seconds: number }
	| { type: 'transport.state'; state: 'playing' | 'paused' | 'stopped' }
	| { type: 'plugin.scan.complete'; count: number };

// ── Typed results ───────────────────────────────────────

export interface HandshakeResult {
	bridgeVersion: string;
	capabilities: string[];
	updateAvailable: boolean;
}

// ── Domain types (Phase 2) ──────────────────────────────

export interface BridgeProject {
	version: string;
	bpm: number;
	timeSignature: [number, number];
	sampleRate: number;
	tracks: BridgeTrackState[];
}

export interface BridgeTrackState {
	id: string;
	name: string;
	instrument: BridgeInstrumentRef | null;
	clips: BridgeMidiClip[];
	volumeDb: number;
	pan: number;
	mute: boolean;
	solo: boolean;
}

export interface BridgeInstrumentRef {
	pluginFormat: 'clap' | 'vst3' | 'builtin';
	pluginId: string;
}

export interface BridgeMidiClip {
	id: string;
	startTick: number;
	lengthTicks: number;
	notes: BridgeMidiNote[];
}

export interface BridgeMidiNote {
	pitch: number;
	velocity: number;
	startTick: number;
	lengthTicks: number;
}

export interface PluginCatalogEntry {
	format: 'clap' | 'vst3' | 'builtin';
	id: string;
	name: string;
	vendor: string;
	path: string;
}

export type JsonPatchOp =
	| { op: 'add'; path: string; value: unknown }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: unknown };

export class BridgeRpcError extends Error {
	readonly code: string;
	constructor(body: BridgeErrorBody) {
		super(body.message);
		this.name = 'BridgeRpcError';
		this.code = body.code;
	}
}
