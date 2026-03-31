<script lang="ts">
	import { PATTERNS, getPatternChords, type ChordPattern } from '$lib/chord-suggest';

	interface Props {
		key: string;
		onInsert: (chords: string) => void;
	}

	let { key: keyName, onInsert }: Props = $props();

	let open = $state(false);
	let previewingIdx = $state<number | null>(null);

	const toggle = () => { open = !open; };

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
	<button class="pattern-toggle" onclick={toggle} title="進行パターン">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M9 18V5l12-2v13" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="16" r="3" />
		</svg>
		パターン挿入
		<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"
			style="transform: rotate({open ? '180deg' : '0'}); transition: transform 0.2s;">
			<polygon points="1,3 9,3 5,7" />
		</svg>
	</button>

	{#if open}
		<div class="pattern-dropdown">
			{#each PATTERNS as pattern, idx}
				<div class="pattern-item">
					<div class="pattern-info">
						<span class="pattern-name">{pattern.nameJa}</span>
						<span class="pattern-name-en">{pattern.name}</span>
					</div>
					<div class="pattern-preview">{getPreview(pattern)}</div>
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
								<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
									<polygon points="4,2 14,8 4,14" />
								</svg>
							{/if}
						</button>
						<button
							class="pattern-btn pattern-btn--insert"
							onclick={() => handleInsert(pattern)}
							title="挿入"
						>
							<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="8" y1="2" x2="8" y2="14" />
								<line x1="2" y1="8" x2="14" y2="8" />
							</svg>
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.pattern-picker {
		position: relative;
	}

	.pattern-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.pattern-toggle:hover {
		background: var(--bg-elevated);
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	.pattern-dropdown {
		position: absolute;
		bottom: 100%;
		left: 0;
		right: 0;
		margin-bottom: 4px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-elevated);
		z-index: 20;
		max-height: 320px;
		overflow-y: auto;
	}

	.pattern-item {
		padding: 8px 10px;
		border-bottom: 1px solid var(--border-subtle);
		transition: background 0.1s;
	}

	.pattern-item:last-child {
		border-bottom: none;
	}

	.pattern-item:hover {
		background: var(--bg-hover);
	}

	.pattern-info {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 2px;
	}

	.pattern-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.pattern-name-en {
		font-size: 0.68rem;
		color: var(--text-muted);
	}

	.pattern-preview {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
