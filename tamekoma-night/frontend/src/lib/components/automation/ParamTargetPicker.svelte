<script lang="ts">
	import type { Track } from '$lib/types/song';
	import type { ChainNode } from '$lib/types/chain';
	import { descriptorForPlugin } from '$lib/components/mixer/plugin-descriptors';

	let {
		track,
		existingLanes,
		onPick,
		onClose
	}: {
		track: Track;
		existingLanes: { nodeId: string; paramId: string }[];
		onPick: (nodeId: string, paramId: string, label: string) => void;
		onClose: () => void;
	} = $props();

	interface Candidate {
		nodeId: string;
		nodeName: string;
		paramId: string;
		paramLabel: string;
		alreadyExists: boolean;
	}

	let chain = $derived(track.chain ?? []);

	let candidates = $derived.by(() => {
		const list: Candidate[] = [];
		for (const node of chain as ChainNode[]) {
			const desc = descriptorForPlugin(node.plugin);
			if (!desc) continue;
			for (const p of desc.params) {
				if (p.kind !== 'number') continue;
				const already = existingLanes.some(
					(l) => l.nodeId === node.id && l.paramId === p.id
				);
				list.push({
					nodeId: node.id,
					nodeName: node.plugin.name,
					paramId: p.id,
					paramLabel: p.label,
					alreadyExists: already
				});
			}
		}
		return list;
	});

	function handlePick(c: Candidate) {
		if (c.alreadyExists) return;
		onPick(c.nodeId, c.paramId, `${c.paramLabel} (${c.nodeName})`);
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
	<div class="modal" role="dialog" aria-label="オートメーション対象を選択">
		<div class="head">
			<h3>パラメータを選択</h3>
			<button type="button" class="close" onclick={onClose} aria-label="閉じる">×</button>
		</div>

		{#if candidates.length === 0}
			<div class="empty">
				このトラックにはオートメーション可能な Insert がありません。Mixer
				タブで Insert を追加してください。
			</div>
		{:else}
			<div class="list">
				{#each candidates as c (c.nodeId + ':' + c.paramId)}
					<button
						type="button"
						class="row"
						class:row--disabled={c.alreadyExists}
						disabled={c.alreadyExists}
						onclick={() => handlePick(c)}
					>
						<span class="row-param">{c.paramLabel}</span>
						<span class="row-node">{c.nodeName}</span>
						{#if c.alreadyExists}
							<span class="row-tag">追加済</span>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
	}
	.modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		width: min(420px, 92vw);
		max-height: 70vh;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.head h3 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-primary);
	}
	.close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.2rem;
		cursor: pointer;
		line-height: 1;
		padding: 0 6px;
	}
	.close:hover {
		color: var(--text-primary);
	}
	.empty {
		padding: var(--space-md);
		text-align: center;
		color: var(--text-muted);
		font-size: 0.78rem;
	}
	.list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-height: 120px;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: var(--space-sm);
		padding: 8px 10px;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
		font-size: 0.78rem;
		color: var(--text-primary);
	}
	.row:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
	}
	.row--disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.row-param {
		font-weight: 600;
	}
	.row-node {
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.row-tag {
		font-size: 0.6rem;
		padding: 2px 6px;
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}
</style>