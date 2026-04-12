// Bridge store — Svelte 5 runes wrapper around BridgeClient.

import { BridgeClient, type BridgeState } from '$lib/bridge/client';
import type {
	BridgeEvent,
	HandshakeResult,
	PluginCatalogEntry,
	UpdateProgress
} from '$lib/bridge/protocol';
import { getBridgeTicket } from '$lib/api';
import { planStore } from '$lib/stores/plan.svelte';

export type BridgeConnectionState = BridgeState;

/**
 * Premium verification state cached from the last session.verify roundtrip.
 * Null until the first successful verification (or when the user is free
 * and never provisioned a ticket).
 */
export interface VerificationState {
	valid: boolean;
	tier: 'free' | 'premium';
	userId?: string;
	entitlements?: {
		bridgeAccess: boolean;
		vstHosting: boolean;
		clapHosting: boolean;
		wavHighQualityExport: boolean;
		automation: boolean;
		mixerNlEdit: boolean;
		builtinSynths: boolean;
	};
	/** Last error message if the verify failed. */
	error?: string;
}

class BridgeStore {
	state = $state<BridgeConnectionState>('idle');
	bridgeVersion = $state<string | null>(null);
	capabilities = $state<string[]>([]);
	updateAvailable = $state(false);
	/**
	 * Full handshake payload. Populated on every successful connection
	 * so the frontend can reach latestVersion / releaseNotes / releaseUrl
	 * from anywhere in the app.
	 */
	handshakeResult = $state<HandshakeResult | null>(null);
	/**
	 * Download/install progress from the last `update.apply` invocation.
	 * `null` when no update is in flight.
	 */
	updateProgress = $state<UpdateProgress | null>(null);
	/**
	 * Most recent session.verify result. Reset on disconnect.
	 */
	verification = $state<VerificationState | null>(null);
	/**
	 * Toggled to true when the last Bridge command failed with
	 * `premium_required`. The app root can render an "Upgrade" modal
	 * against this flag. Caller clears by setting it back to false.
	 */
	premiumRequiredPending = $state(false);
	/**
	 * Short human-readable message describing the last premium-gated
	 * feature that was rejected, e.g. "VST3 ホスティング".
	 */
	premiumRequiredFeature = $state<string | null>(null);
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
			this.handshakeResult = r;
			void this.refreshPluginCatalog(true);
			// Phase 8: provision a premium ticket from the backend and
			// hand it to the Bridge. Free users skip this — the Bridge
			// will see them as free until the next session.verify.
			void this.provisionTicketAndVerify();
		};
		this.client.on('plugin.scan.complete', (e: BridgeEvent) => {
			if (e.type !== 'plugin.scan.complete') return;
			void this.refreshPluginCatalog(false);
		});
		this.client.on('update.progress', (e: BridgeEvent) => {
			if (e.type !== 'update.progress') return;
			this.updateProgress = { phase: e.phase, percent: e.percent };
		});
	}

	/**
	 * Trigger the Bridge-side update apply flow. Returns the pending
	 * promise so callers (e.g. the update modal) can show a spinner.
	 * The actual download/install progress is surfaced via the
	 * `updateProgress` reactive field.
	 */
	async applyUpdate(): Promise<void> {
		this.updateProgress = { phase: 'requesting', percent: 0 };
		try {
			await this.client.send({ type: 'update.apply' });
		} catch (e) {
			this.updateProgress = null;
			throw e;
		}
	}

	/**
	 * Persist a "user dismissed this version" flag so the badge does
	 * not nag after the user clicks 後で. Read from the same key on
	 * component mount to decide whether to render the badge.
	 */
	dismissUpdate(version: string): void {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem('dismissedUpdateVersion', version);
	}

	isUpdateDismissed(version: string): boolean {
		if (typeof localStorage === 'undefined') return false;
		return localStorage.getItem('dismissedUpdateVersion') === version;
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

	/**
	 * Phase 8: fetch a Bridge ticket from the backend and hand it to
	 * the Bridge via `session.verify`. Only runs for premium users —
	 * free users never have an entitlement to verify and the Bridge
	 * treats them as free by default. QA can force-verify by enabling
	 * the plan override in localStorage.
	 */
	async provisionTicketAndVerify(): Promise<void> {
		if (!planStore.isPremium) {
			this.verification = { valid: true, tier: 'free' };
			return;
		}
		try {
			const ticket = await getBridgeTicket();
			const result = await this.client.send<{
				valid: boolean;
				userId?: string;
				tier?: 'free' | 'premium';
				entitlements?: VerificationState['entitlements'];
			}>({ type: 'session.verify', ticket: ticket.ticket });
			this.verification = {
				valid: result.valid === true,
				tier: (result.tier ?? 'free') as 'free' | 'premium',
				userId: result.userId,
				entitlements: result.entitlements
			};
		} catch (e) {
			console.warn('[bridge] session.verify failed', e);
			this.verification = {
				valid: false,
				tier: 'free',
				error: e instanceof Error ? e.message : String(e)
			};
		}
	}

	/**
	 * Surface a `premium_required` error to the UI. Called by callers
	 * of `client.send` that catch `BridgeRpcError.code === 'premium_required'`.
	 * The app root watches `premiumRequiredPending` and renders an
	 * upgrade modal. The `feature` arg is a short label used in the
	 * modal title.
	 */
	notifyPremiumRequired(feature: string): void {
		this.premiumRequiredFeature = feature;
		this.premiumRequiredPending = true;
	}

	/**
	 * Clear the pending premium-required flag. Called when the user
	 * dismisses the upgrade modal.
	 */
	clearPremiumRequired(): void {
		this.premiumRequiredPending = false;
		this.premiumRequiredFeature = null;
	}
}

export const bridgeStore = new BridgeStore();
