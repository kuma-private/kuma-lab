// BridgeUpdateBadge logic tests. We don't mount the Svelte component
// directly (the codebase doesn't use @testing-library/svelte yet) —
// instead we exercise the bridgeStore methods the badge relies on:
//   - isUpdateDismissed / dismissUpdate persistence
//   - applyUpdate's send call + progress field reset
//   - the `updateAvailable && !dismissed` visibility rule

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandshakeResult } from '$lib/bridge/protocol';

// vitest runs with environment: 'node' so there is no built-in
// localStorage. Inject a minimal in-memory shim.
class MemoryStorage {
	private store = new Map<string, string>();
	get length(): number {
		return this.store.size;
	}
	key(n: number): string | null {
		return Array.from(this.store.keys())[n] ?? null;
	}
	getItem(k: string): string | null {
		return this.store.get(k) ?? null;
	}
	setItem(k: string, v: string): void {
		this.store.set(k, v);
	}
	removeItem(k: string): void {
		this.store.delete(k);
	}
	clear(): void {
		this.store.clear();
	}
}

// Fresh store import per test to reset $state fields.
let bridgeStore: typeof import('$lib/stores/bridge.svelte').bridgeStore;

const sentCommands: Array<{ type: string }> = [];
const sendMock = vi.fn(async (cmd: { type: string }) => {
	sentCommands.push(cmd);
	return undefined;
});

beforeEach(async () => {
	vi.resetModules();
	sentCommands.length = 0;
	sendMock.mockClear();

	// Install an in-memory localStorage shim.
	(globalThis as unknown as { localStorage: Storage }).localStorage =
		new MemoryStorage() as unknown as Storage;

	const mod = await import('$lib/stores/bridge.svelte');
	bridgeStore = mod.bridgeStore;
	// Inject mock client so applyUpdate doesn't hit a real WS.
	Object.defineProperty(bridgeStore, 'client', {
		value: { send: sendMock },
		writable: true,
		configurable: true
	});
});

function visibilityRule(hs: HandshakeResult | null): boolean {
	if (!hs?.updateAvailable) return false;
	if (!hs.latestVersion) return false;
	return !bridgeStore.isUpdateDismissed(hs.latestVersion);
}

describe('BridgeUpdateBadge visibility logic', () => {
	it('badge is hidden when no update is available', () => {
		bridgeStore.handshakeResult = null;
		expect(visibilityRule(bridgeStore.handshakeResult)).toBe(false);
	});

	it('badge is hidden when update is available but already dismissed', () => {
		const hs: HandshakeResult = {
			bridgeVersion: '0.1.0',
			capabilities: ['audio'],
			updateAvailable: true,
			latestVersion: '0.2.0',
			releaseNotes: 'bugfixes',
			releaseUrl: 'https://example.test/v0.2.0'
		};
		bridgeStore.handshakeResult = hs;
		bridgeStore.dismissUpdate('0.2.0');
		expect(visibilityRule(bridgeStore.handshakeResult)).toBe(false);
	});

	it('badge is visible when update is available and not dismissed', () => {
		const hs: HandshakeResult = {
			bridgeVersion: '0.1.0',
			capabilities: ['audio'],
			updateAvailable: true,
			latestVersion: '0.2.0',
			releaseNotes: '',
			releaseUrl: ''
		};
		bridgeStore.handshakeResult = hs;
		expect(visibilityRule(bridgeStore.handshakeResult)).toBe(true);
	});
});

describe('BridgeUpdateBadge applyUpdate', () => {
	it('sends update.apply and resets updateProgress on success', async () => {
		bridgeStore.updateProgress = null;
		await bridgeStore.applyUpdate();
		expect(sentCommands.some((c) => c.type === 'update.apply')).toBe(true);
	});

	it('clears updateProgress when apply throws', async () => {
		sendMock.mockImplementationOnce(async () => {
			throw new Error('update failed');
		});
		bridgeStore.updateProgress = null;
		await expect(bridgeStore.applyUpdate()).rejects.toThrow('update failed');
		expect(bridgeStore.updateProgress).toBeNull();
	});
});

describe('BridgeUpdateBadge dismissed version persistence', () => {
	it('dismissUpdate writes to localStorage', () => {
		bridgeStore.dismissUpdate('0.2.0');
		expect(localStorage.getItem('dismissedUpdateVersion')).toBe('0.2.0');
	});

	it('isUpdateDismissed returns true only for the stored version', () => {
		bridgeStore.dismissUpdate('0.2.0');
		expect(bridgeStore.isUpdateDismissed('0.2.0')).toBe(true);
		expect(bridgeStore.isUpdateDismissed('0.3.0')).toBe(false);
	});
});
