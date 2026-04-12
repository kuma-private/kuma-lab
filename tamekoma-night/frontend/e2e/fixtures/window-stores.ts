// Helpers that reach into the `window.__cadenza` global exposed by
// +layout.svelte when localStorage.cadenzaE2E === '1'. Tests use these
// to read store state without coupling to DOM selectors for the same
// information.

import type { Page } from '@playwright/test';

/** Narrow shape describing the fields we inspect from bridgeStore. */
export interface BridgeStoreSnapshot {
	state: 'idle' | 'connecting' | 'connected' | 'disconnected';
	bridgeVersion: string | null;
	capabilities: string[];
	updateAvailable: boolean;
	handshakeResult: { bridgeVersion: string } | null;
	pluginCatalog: Array<{ id: string; name: string; format: string }>;
	builtinCatalog: Array<{ id: string; name: string; format: string }>;
}

export async function readBridgeStore(page: Page): Promise<BridgeStoreSnapshot> {
	return page.evaluate<BridgeStoreSnapshot>(() => {
		const w = window as unknown as {
			__cadenza?: {
				bridgeStore?: {
					state: BridgeStoreSnapshot['state'];
					bridgeVersion: string | null;
					capabilities: string[];
					updateAvailable: boolean;
					handshakeResult: { bridgeVersion: string } | null;
					pluginCatalog: Array<{ id: string; name: string; format: string }>;
					builtinCatalog: Array<{ id: string; name: string; format: string }>;
				};
			};
		};
		const b = w.__cadenza?.bridgeStore;
		if (!b) {
			throw new Error('__cadenza.bridgeStore not exposed — is cadenzaE2E=1 set?');
		}
		// Strip reactive state proxies via JSON round-trip for serialization.
		return JSON.parse(
			JSON.stringify({
				state: b.state,
				bridgeVersion: b.bridgeVersion,
				capabilities: b.capabilities,
				updateAvailable: b.updateAvailable,
				handshakeResult: b.handshakeResult,
				pluginCatalog: b.pluginCatalog,
				builtinCatalog: b.builtinCatalog
			})
		);
	});
}

export interface CurrentSongSnapshot {
	id: string;
	title: string;
	tracks: Array<{
		id: string;
		name: string;
		chain?: Array<{ id: string; plugin: { name: string; uid: string; format: string } }>;
		automation?: Array<{
			nodeId: string;
			paramId: string;
			points: Array<{ id: string; tick: number; value: number }>;
		}>;
	}>;
}

export async function readCurrentSong(page: Page): Promise<CurrentSongSnapshot | null> {
	return page.evaluate<CurrentSongSnapshot | null>(() => {
		const w = window as unknown as {
			__cadenza?: { songStore?: { currentSong: unknown } };
		};
		const cur = w.__cadenza?.songStore?.currentSong;
		if (!cur) return null;
		return JSON.parse(JSON.stringify(cur)) as CurrentSongSnapshot;
	});
}

/** Imperatively call a songStore method by name. Returns its return value. */
export async function callSongStore<T = unknown>(
	page: Page,
	method: string,
	args: unknown[]
): Promise<T> {
	return page.evaluate<T, { method: string; args: unknown[] }>(
		({ method, args }) => {
			const w = window as unknown as {
				__cadenza?: { songStore?: Record<string, unknown> };
			};
			const store = w.__cadenza?.songStore;
			if (!store) throw new Error('__cadenza.songStore not exposed');
			const fn = store[method];
			if (typeof fn !== 'function') throw new Error(`songStore.${method} is not a function`);
			return (fn as (...a: unknown[]) => unknown)(...args) as T;
		},
		{ method, args }
	);
}
