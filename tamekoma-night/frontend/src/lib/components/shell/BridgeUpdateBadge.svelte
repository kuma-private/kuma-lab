<script lang="ts">
	import { bridgeStore } from '$lib/stores/bridge.svelte';

	// Reactively read the handshake payload. When `updateAvailable` flips
	// true and the user hasn't already dismissed this exact version, the
	// badge renders.
	let handshake = $derived(bridgeStore.handshakeResult);
	let updateAvailable = $derived(
		!!handshake?.updateAvailable &&
			!!handshake?.latestVersion &&
			!bridgeStore.isUpdateDismissed(handshake.latestVersion)
	);
	let progress = $derived(bridgeStore.updateProgress);

	let modalOpen = $state(false);
	let applying = $state(false);
	let applyError = $state<string | null>(null);

	async function handleApply() {
		applying = true;
		applyError = null;
		try {
			await bridgeStore.applyUpdate();
		} catch (e) {
			applyError = e instanceof Error ? e.message : String(e);
		} finally {
			applying = false;
		}
	}

	function handleDismiss() {
		if (handshake?.latestVersion) {
			bridgeStore.dismissUpdate(handshake.latestVersion);
		}
		modalOpen = false;
	}
</script>

{#if updateAvailable && handshake}
	<button
		type="button"
		class="update-badge"
		onclick={() => (modalOpen = true)}
		title="Bridge アップデートがあります"
		data-testid="bridge-update-badge"
	>
		<span class="dot" aria-hidden="true"></span>
		<span class="label">更新</span>
	</button>
{/if}

{#if modalOpen && handshake}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={() => (modalOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (modalOpen = false)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="bridge-update-title"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h2 id="bridge-update-title">Bridge {handshake.latestVersion} が利用可能</h2>
			{#if handshake.releaseNotes}
				<div class="release-notes">{handshake.releaseNotes}</div>
			{/if}
			{#if handshake.releaseUrl}
				<a class="release-link" href={handshake.releaseUrl} target="_blank" rel="noopener">
					リリースノートを開く
				</a>
			{/if}
			{#if progress}
				<div class="progress" data-testid="bridge-update-progress">
					{progress.phase}: {progress.percent}%
				</div>
			{/if}
			{#if applyError}
				<div class="error">{applyError}</div>
			{/if}
			<div class="actions">
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleApply}
					disabled={applying}
					data-testid="bridge-update-apply"
				>
					{applying ? '更新中…' : '更新'}
				</button>
				<button
					type="button"
					class="btn"
					onclick={handleDismiss}
					data-testid="bridge-update-dismiss"
				>
					後で
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.update-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px;
		border: 1px solid var(--accent-primary, #e8a84c);
		border-radius: 12px;
		background: rgba(232, 168, 76, 0.1);
		color: var(--accent-primary, #e8a84c);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.update-badge:hover {
		background: rgba(232, 168, 76, 0.2);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent-primary, #e8a84c);
	}

	.label {
		letter-spacing: 0.02em;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.modal {
		max-width: 480px;
		width: calc(100% - 48px);
		background: var(--bg-elevated, #1f1f23);
		border: 1px solid var(--border-default, #3a3a40);
		border-radius: 8px;
		padding: 24px;
		color: var(--text-primary, #e6e6e6);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
	}

	.modal h2 {
		margin: 0 0 16px;
		font-size: 1.15rem;
	}

	.release-notes {
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-secondary, #b0b0b8);
		white-space: pre-wrap;
		max-height: 200px;
		overflow-y: auto;
		margin-bottom: 12px;
	}

	.release-link {
		display: inline-block;
		font-size: 0.8rem;
		color: var(--accent-primary, #e8a84c);
		margin-bottom: 16px;
	}

	.progress {
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 4px;
		font-size: 0.8rem;
		margin-bottom: 12px;
	}

	.error {
		padding: 8px 12px;
		background: rgba(224, 96, 80, 0.1);
		border: 1px solid var(--error, #e06050);
		border-radius: 4px;
		font-size: 0.8rem;
		color: var(--error, #e06050);
		margin-bottom: 12px;
	}

	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}

	.btn {
		padding: 8px 20px;
		border: 1px solid var(--border-default, #3a3a40);
		border-radius: 4px;
		background: transparent;
		color: var(--text-secondary, #b0b0b8);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn:hover:not(:disabled) {
		border-color: var(--text-primary, #e6e6e6);
		color: var(--text-primary, #e6e6e6);
	}

	.btn-primary {
		background: var(--accent-primary, #e8a84c);
		border-color: var(--accent-primary, #e8a84c);
		color: #1f1f23;
	}

	.btn-primary:hover:not(:disabled) {
		background: #d09440;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
