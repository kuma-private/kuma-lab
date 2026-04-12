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
	| { type: 'debug.sine'; on: boolean };

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

export type BridgeEvent = {
	type: 'handshake.ack';
	bridgeVersion: string;
	capabilities: string[];
	updateAvailable: boolean;
};

// ── Typed results ───────────────────────────────────────

export interface HandshakeResult {
	bridgeVersion: string;
	capabilities: string[];
	updateAvailable: boolean;
}

export class BridgeRpcError extends Error {
	readonly code: string;
	constructor(body: BridgeErrorBody) {
		super(body.message);
		this.name = 'BridgeRpcError';
		this.code = body.code;
	}
}
