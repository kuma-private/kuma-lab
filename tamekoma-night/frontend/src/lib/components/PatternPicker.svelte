<script lang="ts">
	import { PATTERNS, getPatternChords, type ChordPattern } from '$lib/chord-suggest';

	interface Props {
		key: string;
		onInsert: (chords: string) => void;
	}

	let { key: keyName, onInsert }: Props = $props();

	let previewingIdx = $state<number | null>(null);

	const handleInsert = (pattern: ChordPattern) => {
		const chords = getPatternChords(pattern, keyName);
		onInsert(chords);
	};

	const handlePreview = async (idx: number) => {
		previewingIdx = idx;
		try {
			const { playSelection } = await import('$lib/chord-player');
			const pattern = PATTERNS[idx];
			const chords = getPatternChords(pattern, keyName);
			await playSelection(chords, { bpm: 120, timeSignature: { beats: 4, beatValue: 4 } });
		} catch (e) {
			console.error('[PatternPicker] preview error:', e);
		} finally {
			previewingIdx = null;
		}
	};

	const handleStop = async () => {
		const { stopSelection } = await import('$lib/chord-player');
		stopSelection();
		previewingIdx = null;
	};

	const getPreview = (pattern: ChordPattern): string => {
		return getPatternChords(pattern, keyName);
	};
</script>

<div class="pattern-picker">
	<div class="pattern-list">
		{#each PATTERNS as pattern, idx}
			<div class="pattern-item">
				<div class="pattern-top">
					<div class="pattern-info">
						<span class="pattern-name">{pattern.nameJa}</span>
						{#if pattern.descJa}
							<span class="pattern-desc">{pattern.descJa}</span>
						{/if}
					</div>
					<div class="pattern-actions">
						{#if previewingIdx === idx}
							<button
								class="pattern-btn pattern-btn--stop"
								onclick={handleStop}
								title="停止"
							>&#9632;</button>
						{:else}
							<button
								class="pattern-btn pattern-btn--play"
								onclick={() => handlePreview(idx)}
								disabled={previewingIdx !== null}
								title="試聴"
							>&#9654;</button>
						{/if}
						<button
							class="pattern-btn pattern-btn--insert"
							onclick={() => handleInsert(pattern)}
							title="挿入"
						>+</button>
					</div>
				</div>
				<div class="pattern-preview">{getPreview(pattern)}</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.pattern-picker {
		position: relative;
	}



	.pattern-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 200px;
		overflow-y: auto;
	}

	.pattern-item {
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		transition: background 0.1s;
		cursor: default;
	}

	.pattern-item:hover {
		background: var(--bg-hover);
	}

	.pattern-item:hover .pattern-preview {
		color: var(--text-secondary);
		white-space: normal;
	}

	.pattern-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.pattern-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.pattern-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.pattern-desc {
		font-size: 0.62rem;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.pattern-preview {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 1px;
		transition: color 0.15s;
	}

	.pattern-actions {
		display: flex;
		gap: 4px;
	}

	.pattern-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
		transition: all 0.15s;
	}

	.pattern-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.pattern-btn--play {
		color: var(--accent-primary);
		border-color: var(--accent-primary);
		background: transparent;
		font-size: 0.55rem;
	}

	.pattern-btn--play:hover:not(:disabled) {
		background: rgba(167, 139, 250, 0.15);
	}

	.pattern-btn--stop {
		color: var(--error);
		font-size: 0.6rem;
	}

	.pattern-btn--stop:hover {
		background: rgba(248, 113, 113, 0.15);
		border-color: var(--error);
	}

	.pattern-btn--insert {
		color: #fff;
		background: var(--success);
		border-color: var(--success);
		font-weight: 700;
	}

	.pattern-btn--insert:hover {
		filter: brightness(1.15);
	}

	.mini-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(167, 139, 250, 0.3);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
