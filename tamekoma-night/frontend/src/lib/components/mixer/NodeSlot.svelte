<script lang="ts">
	import type { ChainNode } from '$lib/types/chain';

	let {
		node,
		onAdd,
		onOpenParams,
		onBypass,
		onRemove,
		onMoveUp,
		onMoveDown
	}: {
		node: ChainNode | null;
		onAdd?: () => void;
		onOpenParams?: () => void;
		onBypass?: (bypass: boolean) => void;
		onRemove?: () => void;
		onMoveUp?: () => void;
		onMoveDown?: () => void;
	} = $props();

	let menuOpen = $state(false);

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<svelte:window onclick={closeMenu} />

{#if node}
	<div class="slot" class:bypass={node.bypass}>
		<button class="name" type="button" onclick={onOpenParams} title={node.plugin.name}>
			{node.plugin.name}
		</button>
		<button
			class="bypass"
			type="button"
			onclick={() => onBypass?.(!node.bypass)}
			title="Bypass"
			aria-pressed={node.bypass}
		>
			B
		</button>
		<button class="menu-trigger" type="button" onclick={toggleMenu} aria-label="メニュー">
			&hellip;
		</button>
		{#if menuOpen}
			<div class="menu" role="menu">
				{#if onOpenParams}
					<button role="menuitem" onclick={(e) => { e.stopPropagation(); menuOpen = false; onOpenParams?.(); }}>
						Open Params
					</button>
				{/if}
				{#if onMoveUp}
					<button role="menuitem" onclick={(e) => { e.stopPropagation(); menuOpen = false; onMoveUp?.(); }}>
						Move Up
					</button>
				{/if}
				{#if onMoveDown}
					<button role="menuitem" onclick={(e) => { e.stopPropagation(); menuOpen = false; onMoveDown?.(); }}>
						Move Down
					</button>
				{/if}
				{#if onRemove}
					<button
						role="menuitem"
						class="danger"
						onclick={(e) => { e.stopPropagation(); menuOpen = false; onRemove?.(); }}
					>
						Remove
					</button>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<button class="slot empty" type="button" onclick={onAdd} aria-label="プラグインを追加">
		<span>+</span>
	</button>
{/if}

<style>
	.slot {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 2px;
		padding: 3px 4px;
		min-height: 22px;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: 3px;
		font-size: 0.65rem;
	}
	.slot.bypass {
		opacity: 0.5;
	}
	.slot.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px dashed var(--border-subtle);
		color: var(--text-muted);
		cursor: pointer;
		padding: 3px 4px;
		min-height: 22px;
	}
	.slot.empty:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}
	.name {
		background: none;
		border: none;
		color: var(--text-primary);
		font-size: 0.66rem;
		font-weight: 600;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0;
		cursor: pointer;
		min-width: 0;
	}
	.name:hover {
		color: var(--accent-primary);
	}
	.bypass {
		width: 14px;
		height: 14px;
		padding: 0;
		border: 1px solid var(--border-subtle);
		border-radius: 2px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.6rem;
		font-weight: 700;
		cursor: pointer;
		line-height: 1;
	}
	.bypass[aria-pressed='true'] {
		background: rgba(224, 96, 80, 0.18);
		color: var(--error);
		border-color: var(--error);
	}
	.menu-trigger {
		width: 14px;
		height: 14px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.75rem;
		line-height: 1;
	}
	.menu-trigger:hover {
		color: var(--text-primary);
	}
	.menu {
		position: absolute;
		top: calc(100% + 2px);
		right: 0;
		min-width: 120px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-elevated);
		z-index: var(--z-context-menu);
		display: flex;
		flex-direction: column;
		padding: 2px;
	}
	.menu button {
		padding: 5px 10px;
		font-size: 0.7rem;
		background: none;
		border: none;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		border-radius: 2px;
	}
	.menu button:hover {
		background: var(--bg-hover);
	}
	.menu .danger {
		color: var(--error);
	}
</style>
