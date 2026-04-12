<script lang="ts">
	import { bridgeStore } from '$lib/stores/bridge.svelte';
	import type { PluginCatalogEntry } from '$lib/bridge/protocol';
	import type { PluginRef } from '$lib/types/chain';

	let {
		onPick,
		onClose
	}: {
		onPick: (plugin: PluginRef) => void;
		onClose: () => void;
	} = $props();

	type Filter = 'all' | 'builtin' | 'vst3' | 'clap';
	let filter = $state<Filter>('all');
	let query = $state('');

	let items = $derived.by(() => {
		const all = bridgeStore.fullCatalog;
		const q = query.trim().toLowerCase();
		return all.filter((p) => {
			if (filter !== 'all' && p.format !== filter) return false;
			if (!q) return true;
			return (
				p.name.toLowerCase().includes(q) ||
				(p.vendor ?? '').toLowerCase().includes(q) ||
				p.id.toLowerCase().includes(q)
			);
		});
	});

	function handlePick(entry: PluginCatalogEntry) {
		const plugin: PluginRef = {
			format: entry.format,
			uid: entry.id,
			name: entry.name,
			vendor: entry.vendor
		};
		onPick(plugin);
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="overlay"
	role="button"
	tabindex="-1"
	onclick={handleOverlayClick}
	onkeydown={() => {}}
>
	<div class="picker" role="dialog" aria-label="プラグインを選択">
		<div class="picker-head">
			<h3>プラグインを追加</h3>
			<button class="close" onclick={onClose} aria-label="閉じる">×</button>
		</div>

		<input
			class="search"
			type="text"
			placeholder="検索..."
			bind:value={query}
		/>

		<div class="tabs">
			<button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
			<button class:active={filter === 'vst3'} onclick={() => (filter = 'vst3')}>VST3</button>
			<button class:active={filter === 'clap'} onclick={() => (filter = 'clap')}>CLAP</button>
			<button class:active={filter === 'builtin'} onclick={() => (filter = 'builtin')}>
				Built-in
			</button>
		</div>

		<div class="list">
			{#each items as item (item.format + ':' + item.id)}
				<button class="row" onclick={() => handlePick(item)} type="button">
					<span class="row-name">{item.name}</span>
					<span class="row-vendor">{item.vendor}</span>
					<span class="row-format format-{item.format}">{item.format}</span>
				</button>
			{/each}
			{#if items.length === 0}
				<div class="empty">該当するプラグインがありません</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
	}
	.picker {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		width: min(520px, 92vw);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		padding: var(--space-md);
		gap: var(--space-sm);
	}
	.picker-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.picker-head h3 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-primary);
	}
	.close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.3rem;
		cursor: pointer;
		padding: 0 6px;
		line-height: 1;
	}
	.close:hover {
		color: var(--text-primary);
	}
	.search {
		padding: 6px 10px;
		font-size: 0.82rem;
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
	}
	.search:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
	}
	.tabs {
		display: flex;
		gap: 4px;
	}
	.tabs button {
		padding: 4px 10px;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.tabs button:hover {
		color: var(--text-primary);
	}
	.tabs button.active {
		background: rgba(232, 168, 76, 0.18);
		color: var(--accent-primary);
		border-color: var(--accent-primary);
	}
	.list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 180px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: var(--space-sm);
		padding: 8px 10px;
		text-align: left;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.78rem;
		color: var(--text-primary);
	}
	.row:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
	}
	.row-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-vendor {
		color: var(--text-muted);
		font-size: 0.7rem;
	}
	.row-format {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		letter-spacing: 0.5px;
	}
	.format-builtin {
		background: rgba(108, 168, 144, 0.18);
		color: #7cb882;
	}
	.format-vst3 {
		background: rgba(232, 168, 76, 0.18);
		color: var(--accent-primary);
	}
	.format-clap {
		background: rgba(110, 168, 208, 0.18);
		color: var(--accent-secondary);
	}
	.empty {
		padding: var(--space-md);
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8rem;
	}
</style>
