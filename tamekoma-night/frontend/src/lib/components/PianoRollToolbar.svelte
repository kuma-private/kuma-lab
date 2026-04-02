<script lang="ts">
	interface Props {
		snapDivision: number;
		onSnapChange: (snap: number) => void;
		onUndo: () => void;
		onRedo: () => void;
		onAutoVoicing: () => void;
		canUndo: boolean;
		canRedo: boolean;
	}

	let {
		snapDivision,
		onSnapChange,
		onUndo,
		onRedo,
		onAutoVoicing,
		canUndo,
		canRedo,
	}: Props = $props();

	const SNAP_OPTIONS = [
		{ value: 1, label: '1bar' },
		{ value: 2, label: '1/2' },
		{ value: 4, label: '1/4' },
		{ value: 8, label: '1/8' },
		{ value: 16, label: '1/16' },
	];
</script>

<div class="piano-roll-toolbar">
	<div class="tool-group snap-group">
		<span class="snap-label">Snap</span>
		{#each SNAP_OPTIONS as opt (opt.value)}
			<button
				class="snap-btn"
				class:active={snapDivision === opt.value}
				onclick={() => onSnapChange(opt.value)}
			>
				{opt.label}
			</button>
		{/each}
	</div>

	<div class="divider"></div>

	<div class="tool-group">
		<button
			class="tool-btn"
			onclick={onUndo}
			disabled={!canUndo}
			title="Undo (Ctrl+Z)"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
				<path d="M4 7h8a3 3 0 110 6H9v-1.5h3a1.5 1.5 0 000-3H4v2.5L0 7.5 4 4v3z"/>
			</svg>
		</button>
		<button
			class="tool-btn"
			onclick={onRedo}
			disabled={!canRedo}
			title="Redo (Ctrl+Shift+Z)"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
				<path d="M12 7H4a3 3 0 100 6h3v-1.5H4a1.5 1.5 0 010-3h8v2.5L16 7.5 12 4v3z"/>
			</svg>
		</button>
	</div>

	<div class="divider"></div>

	<div class="tool-group">
		<button
			class="tool-btn auto-v-btn"
			onclick={onAutoVoicing}
			title="Auto Voicing"
		>
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
				<path d="M2 12V8h2v4H2zm3-3v3h2V9H5zm3-2v5h2V7H8zm3-3v8h2V4h-2z"/>
			</svg>
			<span class="auto-v-label">Auto V</span>
		</button>
	</div>
</div>

<style>
	.piano-roll-toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--bg-surface, #0e0e1f);
		border: 1px solid var(--border-default, #3a3a7a);
		border-radius: 8px;
		flex-wrap: wrap;
	}

	.tool-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: var(--border-subtle, #2a2a5a);
		margin: 0 4px;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: var(--text-secondary, #9090b0);
		cursor: pointer;
		transition: all 0.15s;
	}

	.tool-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary, #e0e0f0);
	}

	.tool-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.auto-v-btn {
		width: auto;
		gap: 4px;
		padding: 0 8px;
	}

	.auto-v-label {
		font-size: 10px;
		font-family: 'JetBrains Mono', monospace;
	}

	.snap-label {
		font-size: 10px;
		color: var(--text-secondary, #9090b0);
		font-family: 'JetBrains Mono', monospace;
		margin-right: 2px;
	}

	.snap-btn {
		padding: 2px 6px;
		height: 24px;
		border: 1px solid transparent;
		border-radius: 3px;
		background: transparent;
		color: var(--text-secondary, #9090b0);
		font-size: 10px;
		font-family: 'JetBrains Mono', monospace;
		cursor: pointer;
		transition: all 0.15s;
	}

	.snap-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary, #e0e0f0);
	}

	.snap-btn.active {
		background: rgba(99, 102, 241, 0.15);
		color: var(--accent-primary, #6366f1);
		border-color: rgba(99, 102, 241, 0.4);
	}

	.snap-group {
		gap: 1px;
	}

	@media (max-width: 600px) {
		.piano-roll-toolbar {
			flex-wrap: wrap;
			gap: 3px;
			padding: 3px 6px;
		}

		.tool-btn {
			width: 44px;
			height: 44px;
		}

		.tool-btn svg {
			width: 20px;
			height: 20px;
		}

		.snap-btn {
			min-height: 36px;
			min-width: 36px;
			padding: 4px 8px;
			font-size: 11px;
		}

		.divider {
			height: 16px;
			margin: 0 2px;
		}

		.snap-label {
			font-size: 11px;
		}
	}
</style>
