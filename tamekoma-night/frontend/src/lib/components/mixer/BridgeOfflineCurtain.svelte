<script lang="ts">
	import { bridgeStore } from '$lib/stores/bridge.svelte';

	function handleRetry() {
		void bridgeStore.client.connect().catch(() => {
			/* ignored — client handles its own reconnect */
		});
	}

	let state = $derived(bridgeStore.state);
</script>

<div class="curtain" role="dialog" aria-label="Bridge offline">
	<div class="card">
		<svg
			class="icon"
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<rect x="3" y="6" width="18" height="12" rx="2" />
			<path d="M7 10h.01M11 10h.01M15 10h.01" />
			<path d="M7 14h10" />
		</svg>
		<h3>Bridge が起動していません</h3>
		<p>
			Mixer 機能を使うには <strong>Cadenza Bridge</strong> をインストール・起動してください。
		</p>
		<div class="actions">
			<a
				class="btn primary"
				href="https://github.com/kuma-private/cadenza-bridge/releases"
				target="_blank"
				rel="noopener noreferrer"
				title="Phase 9 で配布開始"
			>
				Bridge をインストール
			</a>
			<button class="btn ghost" type="button" onclick={handleRetry}>再接続を試す</button>
		</div>
		<div class="status">
			<span class="dot" data-state={state}></span>
			{#if state === 'connecting'}
				接続中...
			{:else if state === 'disconnected'}
				接続を待機中... (2 秒ごとにチェック)
			{:else if state === 'idle'}
				接続未開始
			{:else}
				{state}
			{/if}
		</div>
	</div>
</div>

<style>
	.curtain {
		position: absolute;
		inset: 0;
		background: rgba(8, 6, 4, 0.78);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 5;
	}
	.card {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		max-width: 440px;
		width: 90%;
		box-shadow: var(--shadow-elevated);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}
	.icon {
		color: var(--accent-primary);
		opacity: 0.85;
	}
	h3 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--text-primary);
	}
	p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.actions {
		display: flex;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		padding: 8px 16px;
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
		border: 1px solid transparent;
	}
	.btn.primary {
		background: var(--accent-primary);
		color: #fff;
	}
	.btn.primary:hover {
		background: #d09440;
	}
	.btn.ghost {
		background: var(--bg-elevated);
		color: var(--text-primary);
		border-color: var(--border-default);
	}
	.btn.ghost:hover {
		background: var(--bg-hover);
	}
	.status {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--space-sm);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.dot[data-state='connecting'] {
		background: var(--accent-warm);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.dot[data-state='disconnected'] {
		background: var(--error);
	}
	.dot[data-state='connected'] {
		background: var(--success);
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.4;
		}
		50% {
			opacity: 1;
		}
	}
</style>
