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
		open = false;
	};

	const handlePreview = async (idx: number) => {
		previewingIdx = idx;
		try {
			const { playSelection } = await import('$lib/chord-player');
			const pattern = PATTERNS[idx];
			const chords = getPatternChords(pattern, keyName);
			// Default config for preview
			await playSelection(chords, { bpm: 120, timeSignature: { beats: 4, beatValue: 4 } });
		} catch (e) {
			console.error('[PatternPicker] preview error:', e);
		} finally {
			previewingIdx = null;
		}
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
					<span class="pattern-name">{pattern.nameJa}</span>
					<div class="pattern-actions">
						<button
							class="pattern-btn pattern-btn--play"
							onclick={() => handlePreview(idx)}
							disabled={previewingIdx !== null}
							title="試聴"
						>
							{#if previewingIdx === idx}
								<span class="mini-spinner"></span>
							{:else}
								&#9654;
							{/if}
						</button>
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

	.pattern-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.pattern-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.pattern-preview {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 1px;
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
	}

	.pattern-btn--play:hover:not(:disabled) {
		background: rgba(167, 139, 250, 0.15);
		border-color: var(--accent-primary);
	}

	.pattern-btn--insert {
		color: var(--success);
	}

	.pattern-btn--insert:hover {
		background: rgba(52, 211, 153, 0.15);
		border-color: var(--success);
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
