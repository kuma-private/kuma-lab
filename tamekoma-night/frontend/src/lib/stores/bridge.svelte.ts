// Bridge store — Svelte 5 runes wrapper around BridgeClient.

import { BridgeClient, type BridgeState } from '$lib/bridge/client';
import type { BridgeEvent, HandshakeResult, PluginCatalogEntry } from '$lib/bridge/protocol';

export type BridgeConnectionState = BridgeState;

class BridgeStore {
	state = $state<BridgeConnectionState>('idle');
	bridgeVersion = $state<string | null>(null);
	capabilities = $state<string[]>([]);
	updateAvailable = $state(false);
	pluginCatalog = $state<PluginCatalogEntry[]>([]);
	/**
	 * Per-track peak/rms level (0..1). Phase 5: populated by no one — the Rust
	 * side does not yet emit `level.meter` events. Meters render silent bars
	 * until Phase 6 wires real events.
	 */
	meters = $state<Record<string, { peak: number; rms: number }>>({});

	/**
	 * Built-in plugins always available regardless of Bridge state. The Rust
	 * side hard-codes the same set; keep ids in sync with bridge-plugin-host.
	 */
	readonly builtinCatalog: PluginCatalogEntry[] = [
		{ format: 'builtin', id: 'gain', name: 'Gain', vendor: 'Cadenza', path: 'builtin:gain' },
		{ format: 'builtin', id: 'svf', name: 'Filter', vendor: 'Cadenza', path: 'builtin:svf' },
		{
			format: 'builtin',
			id: 'compressor',
			name: 'Compressor',
			vendor: 'Cadenza',
			path: 'builtin:compressor'
		}
	];

	/** Built-ins first, then whatever the Bridge scan returned. */
	get fullCatalog(): PluginCatalogEntry[] {
		return [...this.builtinCatalog, ...this.pluginCatalog];
	}

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
			void this.refreshPluginCatalog(true);
		};
		this.client.on('plugin.scan.complete', (e: BridgeEvent) => {
			if (e.type !== 'plugin.scan.complete') return;
			void this.refreshPluginCatalog(false);
		});
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

	/**
	 * Trigger a fresh plugin scan (optional) then fetch the current catalog.
	 * Called automatically after handshake and on plugin.scan.complete events.
	 */
	async refreshPluginCatalog(scanFirst: boolean): Promise<void> {
		try {
			if (scanFirst) {
				await this.client.send({ type: 'plugins.scan' });
			}
			const list = await this.client.send<PluginCatalogEntry[]>({ type: 'plugins.list' });
			if (Array.isArray(list)) {
				this.pluginCatalog = list;
			}
		} catch (e) {
			// Bridge may not yet implement these in early Phase 2 — degrade silently.
			console.warn('[bridge] plugin catalog refresh failed', e);
		}
	}
}

export const bridgeStore = new BridgeStore();
