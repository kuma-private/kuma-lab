<script lang="ts">
	import type { Thread } from '$lib/api';
	import ScoreEditor, { type DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import AiReview from '$lib/components/AiReview.svelte';

	interface Props {
		thread: Thread;
		scoreEditorValue: string;
		activeBarIndex: number;
		scoreDisplayMode: DisplayMode;
		transposeSemitones: number;
		pendingInsertText: string;
		commentInput: string;
		submitting: boolean;
		reviewing: boolean;
		latestAiComment: string;
		latestAiScores: { tension: number; creativity: number; coherence: number; surprise: number } | null;
		onScoreChange: (value: string) => void;
		onSave: () => void;
		onRequestReview: () => void;
		onTransposeUp: () => void;
		onTransposeDown: () => void;
		onDisplayModeChange: (mode: DisplayMode) => void;
		onCommentChange: (value: string) => void;
		onInsertBar: () => void;
		onInsertNewline: () => void;
		onDeleteLastLine: () => void;
	}

	let {
		thread,
		scoreEditorValue,
		activeBarIndex,
		scoreDisplayMode,
		transposeSemitones,
		pendingInsertText,
		commentInput,
		submitting,
		reviewing,
		latestAiComment,
		latestAiScores,
		onScoreChange,
		onSave,
		onRequestReview,
		onTransposeUp,
		onTransposeDown,
		onDisplayModeChange,
		onCommentChange,
		onInsertBar,
		onInsertNewline,
		onDeleteLastLine,
	}: Props = $props();

	const lineCount = $derived(scoreEditorValue.split('\n').filter((l: string) => l.trim()).length);
</script>

<div class="panel panel-main">
	{#if latestAiComment || latestAiScores}
		<div class="ai-section">
			<AiReview comment={latestAiComment} scores={latestAiScores} />
		</div>
	{/if}

	<div class="panel-header">
		<div class="score-tabs">
			<button
				class="score-tab"
				class:score-tab--active={scoreDisplayMode === 'chord'}
				onclick={() => { onDisplayModeChange('chord'); }}
			>コード</button>
			<button
				class="score-tab"
				class:score-tab--active={scoreDisplayMode === 'degree'}
				onclick={() => { onDisplayModeChange('degree'); }}
			>ディグリー</button>
		</div>
		<div class="panel-header-right">
			<div class="transpose-controls">
				<button class="transpose-btn" onclick={onTransposeDown} title="半音下げ">-</button>
				<span class="transpose-label">
					{#if transposeSemitones !== 0}
						{transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
					{:else}
						Key: {thread.key}
					{/if}
				</span>
				<button class="transpose-btn" onclick={onTransposeUp} title="半音上げ">+</button>
			</div>
			<span class="count">{lineCount} lines</span>
		</div>
	</div>

	<div class="score-toolbar">
		<button class="score-tool-btn" onclick={onInsertBar} title="小節区切りを追加">
			<span class="tool-label">|</span> 小節
		</button>
		<button class="score-tool-btn" onclick={onInsertNewline} title="改行を追加">
			改行
		</button>
		<button class="score-tool-btn score-tool-btn--danger" onclick={onDeleteLastLine} title="最終行を削除">
			最終行を削除
		</button>
	</div>

	<div class="score-area">
		{#if !scoreEditorValue.trim()}
			<div class="empty-score">
				<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.2">
					<path d="M9 18V5l12-2v13" />
					<circle cx="6" cy="18" r="3" />
					<circle cx="18" cy="16" r="3" />
				</svg>
				<p>スコアはまだ空です。最初のコードを追加しよう!</p>
			</div>
		{:else}
			<ScoreEditor
				value={scoreEditorValue}
				readonly={false}
				{activeBarIndex}
				displayMode={scoreDisplayMode}
				musicalKey={thread.key}
				pendingInsert={pendingInsertText}
				onchange={onScoreChange}
			/>
		{/if}
	</div>

	<div class="save-area">
		<textarea
			class="comment-textarea"
			value={commentInput}
			oninput={(e) => onCommentChange(e.currentTarget.value)}
			placeholder="コメントを残す..."
			rows="1"
		></textarea>
		<div class="save-buttons">
			<button
				class="btn-submit-turn"
				onclick={onSave}
				disabled={submitting}
			>
				{#if submitting}
					<span class="spinner"></span>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
						<polyline points="17 21 17 13 7 13 7 21" />
						<polyline points="7 3 7 8 15 8" />
					</svg>
				{/if}
				保存
			</button>
			<button
				class="btn-review"
				onclick={onRequestReview}
				disabled={reviewing}
			>
				{#if reviewing}
					<span class="spinner"></span>
				{:else}
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
						<path d="M12 6v6l4 2"/>
					</svg>
				{/if}
				AI分析
			</button>
		</div>
	</div>
</div>

<style>
	.panel {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.panel-main {
		min-height: 300px;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
	}

	.score-tabs {
		display: flex;
		gap: 2px;
		background: var(--bg-base);
		border-radius: var(--radius-sm);
		padding: 2px;
	}

	.score-tab {
		padding: 4px 12px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s;
	}

	.score-tab:hover {
		color: var(--text-primary);
	}

	.score-tab--active {
		background: var(--bg-elevated);
		color: var(--accent-primary);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.count { font-size: 0.75rem; color: var(--text-muted); }

	.ai-section {
		padding: var(--space-md);
	}

	.panel-header-right {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.transpose-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.transpose-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 700;
		font-family: var(--font-mono);
		cursor: pointer;
		transition: all 0.15s;
		line-height: 1;
	}

	.transpose-btn:hover {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}

	.transpose-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-muted);
		min-width: 48px;
		text-align: center;
	}

	/* Score area */
	.score-toolbar {
		display: flex;
		gap: 4px;
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
	}

	.score-tool-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.score-tool-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.score-tool-btn--danger:hover {
		border-color: var(--error);
		color: var(--error);
	}

	.tool-label {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.85rem;
	}

	.score-area {
		padding: var(--space-md);
	}

	.empty-score {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-xl);
		font-size: 0.85rem;
	}

	/* Save area */
	.save-area {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-md) var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.save-buttons {
		display: flex;
		gap: var(--space-sm);
	}

	.comment-textarea {
		width: 100%;
		font-size: 0.8rem;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: 6px;
		background: var(--bg-base);
		color: var(--text-primary);
		resize: none;
		box-sizing: border-box;
	}

	.comment-textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	.comment-textarea::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.btn-submit-turn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		flex: 1;
		padding: var(--space-sm) var(--space-lg);
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		border: none;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-submit-turn:hover:not(:disabled) {
		background: var(--accent-secondary);
		transform: translateY(-1px);
	}

	.btn-submit-turn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.btn-review {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--accent-primary);
		border: 1px solid var(--accent-primary);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.btn-review:hover:not(:disabled) {
		background: rgba(167, 139, 250, 0.1);
	}

	.btn-review:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.btn-review .spinner {
		border-color: rgba(167, 139, 250, 0.3);
		border-top-color: var(--accent-primary);
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
