<script lang="ts">
	interface Props {
		visible: boolean;
		x: number;
		y: number;
		onReaction: (emoji: string) => void;
		onComment: () => void;
		onAiAnalyze: () => void;
	}

	let { visible, x, y, onReaction, onComment, onAiAnalyze }: Props = $props();

	let showReactionPicker = $state(false);

	const reactions = [
		{ emoji: '\u{1F44D}', label: 'いいね' },
		{ emoji: '\u{1F525}', label: 'エモい' },
		{ emoji: '\u{1F4A1}', label: 'おもしろい' },
		{ emoji: '\u{1F60D}', label: '美しい' },
	];

	const handleReactionClick = (emoji: string) => {
		showReactionPicker = false;
		onReaction(emoji);
	};

	const handleToggleReactions = () => {
		showReactionPicker = !showReactionPicker;
	};

	// Reset picker when bar hides
	$effect(() => {
		if (!visible) showReactionPicker = false;
	});
</script>

{#if visible}
	<div class="fab" style="left: {x}px; top: {y}px;">
		<button class="fab-btn" onclick={handleToggleReactions} title="リアクション">
			<span class="fab-icon">{'\u{1F44D}'}</span> いいね
		</button>
		<button class="fab-btn" onclick={onComment} title="コメント">
			<span class="fab-icon">{'\u{1F4AC}'}</span> コメント
		</button>
		<button class="fab-btn" onclick={onAiAnalyze} title="AI分析">
			<span class="fab-icon">{'\u{1F916}'}</span> AI分析
		</button>

		{#if showReactionPicker}
			<div class="reaction-picker">
				{#each reactions as r}
					<button class="reaction-option" onclick={() => handleReactionClick(r.emoji)} title={r.label}>
						<span class="reaction-emoji">{r.emoji}</span>
						<span class="reaction-label">{r.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.fab {
		position: fixed;
		z-index: 90;
		display: flex;
		gap: 2px;
		background: var(--bg-elevated, #1e1e3a);
		border: 1px solid var(--border-default, #333);
		border-radius: var(--radius-md, 8px);
		padding: 3px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		animation: fab-in 0.15s ease-out;
	}

	@keyframes fab-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.fab-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		border: none;
		border-radius: var(--radius-sm, 4px);
		background: transparent;
		color: var(--text-secondary, #ccc);
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.12s;
		white-space: nowrap;
	}

	.fab-btn:hover {
		background: var(--bg-hover, rgba(255, 255, 255, 0.08));
		color: var(--text-primary, #fff);
	}

	.fab-icon {
		font-size: 0.85rem;
	}

	.reaction-picker {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		display: flex;
		gap: 2px;
		background: var(--bg-elevated, #1e1e3a);
		border: 1px solid var(--border-default, #333);
		border-radius: var(--radius-md, 8px);
		padding: 3px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		animation: fab-in 0.12s ease-out;
	}

	.reaction-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 10px;
		border: none;
		border-radius: var(--radius-sm, 4px);
		background: transparent;
		color: var(--text-secondary, #ccc);
		cursor: pointer;
		transition: background 0.12s;
	}

	.reaction-option:hover {
		background: var(--bg-hover, rgba(255, 255, 255, 0.08));
	}

	.reaction-emoji {
		font-size: 1.2rem;
	}

	.reaction-label {
		font-size: 0.6rem;
		white-space: nowrap;
	}
</style>
