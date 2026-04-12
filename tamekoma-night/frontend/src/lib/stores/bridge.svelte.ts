// Bridge store — Svelte 5 runes wrapper around BridgeClient.

import { BridgeClient, type BridgeState } from '$lib/bridge/client';
import type { HandshakeResult } from '$lib/bridge/protocol';

export type BridgeConnectionState = BridgeState;

class BridgeStore {
	state = $state<BridgeConnectionState>('idle');
	bridgeVersion = $state<string | null>(null);
	capabilities = $state<string[]>([]);
	updateAvailable = $state(false);

	readonly client: BridgeClient;
	private initialized = false;

	constructor() {
		this.client = new BridgeClient({
			logger: (level, msg, err) => {
				if (level === 'debug') return;
				// eslint-disable-next-line no-console
				console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
					`[bridge] ${msg}`,
					err ?? ''
				);
			}
		});
		this.client.onStateChange = (s) => {
			this.state = s;
			if (s !== 'connected') {
				// Keep last-known version for UI continuity; clear capabilities.
			}
		};
		this.client.onHandshake = (r: HandshakeResult) => {
			this.bridgeVersion = r.bridgeVersion;
			this.capabilities = r.capabilities;
			this.updateAvailable = r.updateAvailable;
		};
	}

	init(): void {
		if (this.initialized) return;
		if (typeof window === 'undefined') return;
		this.initialized = true;
		void this.client.connect().catch(() => {
			/* client already handles reconnect; suppress unhandled */
		});
	}

	dispose(): void {
		this.client.disconnect();
	}
}

export const bridgeStore = new BridgeStore();
