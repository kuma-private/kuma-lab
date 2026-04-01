<script lang="ts">
	import type { Thread } from '$lib/api';
	import CircleOfFifths from '$lib/components/CircleOfFifths.svelte';
	import PatternPicker from '$lib/components/PatternPicker.svelte';

	interface Props {
		thread: Thread;
		canAct: boolean;
		scoreReadonly: boolean;
		onChordSelect: (chord: string) => void;
		onPatternInsert: (chords: string) => void;
	}

	let {
		thread,
		canAct,
		scoreReadonly,
		onChordSelect,
		onPatternInsert,
	}: Props = $props();

	let patternOpen = $state(true);

	const togglePattern = () => {
		patternOpen = !patternOpen;
	};
</script>

<div class="panel panel-tools">
	{#if thread.key}
		<div class="tool-section">
			<div class="tool-header">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<path d="M12 2 L12 12 L18 18" />
				</svg>
				<span>五度圏</span>
			</div>
			<CircleOfFifths currentKey={thread.key} onSelect={(chord) => {
				if (scoreReadonly) return;
				onChordSelect(chord);
			}} />
		</div>

		<div class="tool-section tool-section--collapsible">
			<button class="tool-collapse-btn" onclick={togglePattern}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M9 18V5l12-2v13" />
					<circle cx="6" cy="18" r="3" />
					<circle cx="18" cy="16" r="3" />
				</svg>
				<span>パターン</span>
				<svg
					class="tool-chevron"
					class:tool-chevron--open={patternOpen}
					width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
				>
					<polyline points="4,6 8,10 12,6" />
				</svg>
			</button>
			{#if patternOpen}
				<div class="tool-collapse-content">
					<PatternPicker key={thread.key} onInsert={onPatternInsert} />
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.panel {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.panel-tools {
		position: sticky;
		top: var(--space-md);
		max-height: calc(100vh - 220px);
		overflow-y: auto;
	}

	.tool-section {
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
	}

	.tool-section:last-child {
		border-bottom: none;
	}

	.tool-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-xs) 0;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.tool-collapse-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: var(--space-sm) 0;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		transition: color 0.15s;
	}

	.tool-collapse-btn:hover {
		color: var(--text-primary);
	}

	.tool-chevron {
		margin-left: auto;
		transition: transform 0.2s;
	}

	.tool-chevron--open {
		transform: rotate(180deg);
	}

	.tool-collapse-content {
		padding: var(--space-xs) 0 var(--space-sm);
	}

	@media (max-width: 600px) {
		.panel-tools {
			position: static;
			max-height: none;
		}
	}
</style>
