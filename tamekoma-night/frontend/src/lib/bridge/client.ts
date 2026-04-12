// BridgeClient — plain TypeScript WebSocket RPC client for Cadenza Bridge.
// Reactivity lives in the Svelte store wrapper; this class is unit-testable.

import {
	BRIDGE_PORT_RANGE,
	BRIDGE_PROTOCOL_VERSION,
	BridgeRpcError,
	DEFAULT_RPC_TIMEOUT_MS,
	type BridgeEvent,
	type Command,
	type HandshakeResult,
	type IncomingMessage,
	type RequestEnvelope
} from './protocol';

export type BridgeState = 'idle' | 'connecting' | 'connected' | 'disconnected';

type PendingEntry = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export interface BridgeClientOptions {
	ports?: readonly number[];
	reconnectDelayMs?: number;
	rpcTimeoutMs?: number;
	webSocketFactory?: (url: string) => WebSocket;
	now?: () => number;
	logger?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, err?: unknown) => void;
}

const RECONNECT_DELAY_MS = 2000;

export class BridgeClient {
	private readonly ports: readonly number[];
	private readonly reconnectDelayMs: number;
	private readonly rpcTimeoutMs: number;
	private readonly wsFactory: (url: string) => WebSocket;
	private readonly log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, err?: unknown) => void;

	private ws: WebSocket | null = null;
	private state: BridgeState = 'idle';
	private pending = new Map<string, PendingEntry>();
	private eventHandlers = new Map<string, Set<(ev: BridgeEvent) => void>>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	// Callbacks (assigned externally)
	onStateChange: ((s: BridgeState) => void) | null = null;
	onHandshake: ((r: HandshakeResult) => void) | null = null;
	onEvent: ((ev: BridgeEvent) => void) | null = null;
	onDisconnect: (() => void) | null = null;

	constructor(opts: BridgeClientOptions = {}) {
		this.ports = opts.ports ?? BRIDGE_PORT_RANGE;
		this.reconnectDelayMs = opts.reconnectDelayMs ?? RECONNECT_DELAY_MS;
		this.rpcTimeoutMs = opts.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
		this.wsFactory = opts.webSocketFactory ?? ((url) => new WebSocket(url));
		this.log = opts.logger ?? (() => {});
	}

	getState(): BridgeState {
		return this.state;
	}

	async connect(): Promise<void> {
		if (this.disposed) return;
		if (this.state === 'connecting' || this.state === 'connected') return;

		this.setState('connecting');

		// Try ports in order — first WS that OPENs wins.
		for (const port of this.ports) {
			try {
				const ws = await this.tryOpen(port);
				this.attach(ws);
				await this.performHandshake();
				return;
			} catch (e) {
				this.log('debug', `bridge: port ${port} failed`, e);
				continue;
			}
		}

		// All ports failed
		this.setState('disconnected');
		this.scheduleReconnect();
	}

	disconnect(): void {
		this.disposed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.rejectAllPending(new Error('Bridge disconnected'));
		if (this.ws) {
			try {
				this.ws.close();
			} catch {
				/* ignore */
			}
			this.ws = null;
		}
		this.setState('idle');
	}

	async send<R = unknown>(command: Command, timeoutMs?: number): Promise<R> {
		if (!this.ws || this.state !== 'connected') {
			throw new Error('Bridge not connected');
		}
		return this.sendRaw<R>(command, timeoutMs ?? this.rpcTimeoutMs);
	}

	on(eventType: string, handler: (ev: BridgeEvent) => void): () => void {
		let set = this.eventHandlers.get(eventType);
		if (!set) {
			set = new Set();
			this.eventHandlers.set(eventType, set);
		}
		set.add(handler);
		return () => {
			set!.delete(handler);
		};
	}

	// ── Private ─────────────────────────────────────────

	private tryOpen(port: number): Promise<WebSocket> {
		return new Promise((resolve, reject) => {
			let settled = false;
			let ws: WebSocket;
			try {
				ws = this.wsFactory(`ws://localhost:${port}`);
			} catch (e) {
				reject(e instanceof Error ? e : new Error(String(e)));
				return;
			}
			const onOpen = () => {
				if (settled) return;
				settled = true;
				ws.removeEventListener('open', onOpen);
				ws.removeEventListener('error', onError);
				ws.removeEventListener('close', onError);
				resolve(ws);
			};
			const onError = () => {
				if (settled) return;
				settled = true;
				ws.removeEventListener('open', onOpen);
				ws.removeEventListener('error', onError);
				ws.removeEventListener('close', onError);
				try {
					ws.close();
				} catch {
					/* ignore */
				}
				reject(new Error(`WebSocket failed on port ${port}`));
			};
			ws.addEventListener('open', onOpen);
			ws.addEventListener('error', onError);
			ws.addEventListener('close', onError);
		});
	}

	private attach(ws: WebSocket): void {
		this.ws = ws;
		ws.addEventListener('message', (msgEv) => this.handleMessage(msgEv));
		ws.addEventListener('close', () => this.handleClose());
		ws.addEventListener('error', () => this.handleError());
	}

	private async performHandshake(): Promise<void> {
		// At this point ws is open; mark connected so send() works.
		this.setState('connected');
		try {
			const result = await this.sendRaw<HandshakeResult>(
				{ type: 'handshake', version: BRIDGE_PROTOCOL_VERSION },
				this.rpcTimeoutMs
			);
			this.onHandshake?.(result);
		} catch (e) {
			this.log('warn', 'bridge: handshake failed', e);
			try {
				this.ws?.close();
			} catch {
				/* ignore */
			}
			throw e;
		}
	}

	private sendRaw<R>(command: Command, timeoutMs: number): Promise<R> {
		return new Promise<R>((resolve, reject) => {
			const id = crypto.randomUUID();
			const envelope: RequestEnvelope = { kind: 'request', id, command };
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Bridge RPC timeout (${command.type})`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (v) => resolve(v as R),
				reject,
				timer
			});
			try {
				this.ws!.send(JSON.stringify(envelope));
			} catch (e) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(e instanceof Error ? e : new Error(String(e)));
			}
		});
	}

	private handleMessage(msgEv: MessageEvent): void {
		let parsed: IncomingMessage;
		try {
			parsed = JSON.parse(String(msgEv.data)) as IncomingMessage;
		} catch (e) {
			this.log('warn', 'bridge: invalid JSON message', e);
			return;
		}

		if (parsed.kind === 'response') {
			const entry = this.pending.get(parsed.id);
			if (!entry) {
				this.log('warn', `bridge: response with unknown id ${parsed.id}`);
				return;
			}
			clearTimeout(entry.timer);
			this.pending.delete(parsed.id);
			if (parsed.ok) {
				entry.resolve(parsed.result);
			} else {
				entry.reject(new BridgeRpcError(parsed.error));
			}
			return;
		}

		if (parsed.kind === 'event') {
			const ev = parsed.event;
			this.onEvent?.(ev);
			const set = this.eventHandlers.get(ev.type);
			if (set) {
				for (const h of set) h(ev);
			}
			return;
		}
	}

	private handleClose(): void {
		if (this.state === 'idle') return;
		this.ws = null;
		this.rejectAllPending(new Error('Bridge connection closed'));
		this.setState('disconnected');
		this.onDisconnect?.();
		this.scheduleReconnect();
	}

	private handleError(): void {
		// Error typically precedes close; rely on close handler for cleanup.
		this.log('debug', 'bridge: websocket error');
	}

	private scheduleReconnect(): void {
		if (this.disposed) return;
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			void this.connect();
		}, this.reconnectDelayMs);
	}

	private rejectAllPending(err: Error): void {
		for (const [, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.reject(err);
		}
		this.pending.clear();
	}

	private setState(s: BridgeState): void {
		if (this.state === s) return;
		this.state = s;
		this.onStateChange?.(s);
	}
}
