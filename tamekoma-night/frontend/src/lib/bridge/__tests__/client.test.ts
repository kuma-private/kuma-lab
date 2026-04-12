import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeClient } from '../client';
import type { IncomingMessage, RequestEnvelope } from '../protocol';

// ── Minimal mock WebSocket ─────────────────────────────

type Listener = (ev: unknown) => void;

class MockWebSocket {
	static instances: MockWebSocket[] = [];
	readonly url: string;
	readyState = 0;
	sent: string[] = [];
	private listeners = new Map<string, Set<Listener>>();

	constructor(url: string) {
		this.url = url;
		MockWebSocket.instances.push(this);
	}

	addEventListener(type: string, fn: Listener) {
		let set = this.listeners.get(type);
		if (!set) {
			set = new Set();
			this.listeners.set(type, set);
		}
		set.add(fn);
	}
	removeEventListener(type: string, fn: Listener) {
		this.listeners.get(type)?.delete(fn);
	}
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.readyState = 3;
		this.emit('close', {});
	}
	// test helpers
	emit(type: string, ev: unknown) {
		const set = this.listeners.get(type);
		if (!set) return;
		for (const fn of set) fn(ev);
	}
	open() {
		this.readyState = 1;
		this.emit('open', {});
	}
	receive(msg: IncomingMessage) {
		this.emit('message', { data: JSON.stringify(msg) });
	}
}

function makeClient(portSucceedsAt?: number) {
	const factory = (url: string) => new MockWebSocket(url) as unknown as WebSocket;
	const ports = [7890, 7891, 7892];
	const client = new BridgeClient({
		ports,
		reconnectDelayMs: 10,
		rpcTimeoutMs: 200,
		webSocketFactory: factory
	});

	// Drive the mock WS through port attempts.
	const drive = async () => {
		// Let microtasks flush so tryOpen constructs the WS.
		await Promise.resolve();
		await Promise.resolve();
		// Walk attempts: fail the ones before portSucceedsAt.
		for (let i = 0; i < ports.length; i++) {
			const ws = MockWebSocket.instances[i];
			if (!ws) return;
			if (portSucceedsAt !== undefined && ports[i] === portSucceedsAt) {
				ws.open();
				return;
			}
			ws.emit('error', {});
			await Promise.resolve();
			await Promise.resolve();
		}
	};
	return { client, drive };
}

beforeEach(() => {
	MockWebSocket.instances = [];
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('BridgeClient', () => {
	it('performs handshake round-trip and resolves result', async () => {
		const { client, drive } = makeClient(7890);
		const onHandshake = vi.fn();
		client.onHandshake = onHandshake;

		const connectPromise = client.connect();
		await drive();

		// Handshake request should have been sent
		const ws = MockWebSocket.instances[0];
		expect(ws.sent.length).toBe(1);
		const sent = JSON.parse(ws.sent[0]) as RequestEnvelope;
		expect(sent.kind).toBe('request');
		expect(sent.command.type).toBe('handshake');

		// Respond with handshake result
		ws.receive({
			kind: 'response',
			id: sent.id,
			ok: true,
			result: {
				bridgeVersion: '0.1.0',
				capabilities: ['audio', 'debug'],
				updateAvailable: false
			}
		});

		await connectPromise;
		expect(client.getState()).toBe('connected');
		expect(onHandshake).toHaveBeenCalledWith({
			bridgeVersion: '0.1.0',
			capabilities: ['audio', 'debug'],
			updateAvailable: false
		});
	});

	it('falls through ports on connect error then succeeds', async () => {
		const { client, drive } = makeClient(7891);
		const connectPromise = client.connect();
		await drive();
		expect(MockWebSocket.instances.length).toBe(2);
		const ws = MockWebSocket.instances[1];
		expect(ws.url).toContain('7891');
		// Reply to handshake
		const sent = JSON.parse(ws.sent[0]) as RequestEnvelope;
		ws.receive({
			kind: 'response',
			id: sent.id,
			ok: true,
			result: { bridgeVersion: '0.1.0', capabilities: [], updateAvailable: false }
		});
		await connectPromise;
		expect(client.getState()).toBe('connected');
	});

	it('correlates RPC responses by id', async () => {
		const { client, drive } = makeClient(7890);
		const connectPromise = client.connect();
		await drive();
		const ws = MockWebSocket.instances[0];
		const handshakeReq = JSON.parse(ws.sent[0]) as RequestEnvelope;
		ws.receive({
			kind: 'response',
			id: handshakeReq.id,
			ok: true,
			result: { bridgeVersion: '0.1.0', capabilities: [], updateAvailable: false }
		});
		await connectPromise;

		// Issue two concurrent requests
		const p1 = client.send({ type: 'debug.sine', on: true });
		const p2 = client.send({ type: 'debug.sine', on: false });

		await Promise.resolve();
		const reqA = JSON.parse(ws.sent[1]) as RequestEnvelope;
		const reqB = JSON.parse(ws.sent[2]) as RequestEnvelope;
		expect(reqA.id).not.toEqual(reqB.id);

		// Respond in REVERSE order
		ws.receive({ kind: 'response', id: reqB.id, ok: true, result: 'B' });
		ws.receive({ kind: 'response', id: reqA.id, ok: true, result: 'A' });

		await expect(p1).resolves.toBe('A');
		await expect(p2).resolves.toBe('B');
	});

	it('times out RPC when no response arrives', async () => {
		const { client, drive } = makeClient(7890);
		const connectPromise = client.connect();
		await drive();
		const ws = MockWebSocket.instances[0];
		const handshakeReq = JSON.parse(ws.sent[0]) as RequestEnvelope;
		ws.receive({
			kind: 'response',
			id: handshakeReq.id,
			ok: true,
			result: { bridgeVersion: '0.1.0', capabilities: [], updateAvailable: false }
		});
		await connectPromise;

		const p = client.send({ type: 'debug.sine', on: true });
		vi.advanceTimersByTime(250);
		await expect(p).rejects.toThrow(/timeout/);
	});

	it('rejects pending requests when connection closes', async () => {
		const { client, drive } = makeClient(7890);
		const connectPromise = client.connect();
		await drive();
		const ws = MockWebSocket.instances[0];
		const handshakeReq = JSON.parse(ws.sent[0]) as RequestEnvelope;
		ws.receive({
			kind: 'response',
			id: handshakeReq.id,
			ok: true,
			result: { bridgeVersion: '0.1.0', capabilities: [], updateAvailable: false }
		});
		await connectPromise;

		const p = client.send({ type: 'debug.sine', on: true });
		ws.close();
		await expect(p).rejects.toThrow(/closed/);
		expect(client.getState()).toBe('disconnected');
	});

	it('dispatches events to handlers', async () => {
		const { client, drive } = makeClient(7890);
		const connectPromise = client.connect();
		await drive();
		const ws = MockWebSocket.instances[0];
		const handshakeReq = JSON.parse(ws.sent[0]) as RequestEnvelope;
		ws.receive({
			kind: 'response',
			id: handshakeReq.id,
			ok: true,
			result: { bridgeVersion: '0.1.0', capabilities: [], updateAvailable: false }
		});
		await connectPromise;

		const handler = vi.fn();
		client.on('handshake.ack', handler);
		ws.receive({
			kind: 'event',
			event: {
				type: 'handshake.ack',
				bridgeVersion: '0.1.0',
				capabilities: [],
				updateAvailable: false
			}
		});
		expect(handler).toHaveBeenCalled();
	});
});
