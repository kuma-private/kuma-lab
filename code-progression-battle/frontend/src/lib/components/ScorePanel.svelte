<script lang="ts">
	import type { Thread, Annotation } from '$lib/api';
	import ScoreEditor, { type DisplayMode } from '$lib/components/ScoreEditor.svelte';

	interface Props {
		thread: Thread;
		scoreEditorValue: string;
		activeBarIndex: number;
		scoreDisplayMode: DisplayMode;
		transposeSemitones: number;
		pendingInsertText: string;
		annotations?: Annotation[];
		onScoreChange: (value: string) => void;
		onImport: () => void;
		onTransposeUp: () => void;
		onTransposeDown: () => void;
		onDisplayModeChange: (mode: DisplayMode) => void;
		onInsertBar: () => void;
		onInsertNewline: () => void;
		onDeleteLastLine: () => void;
		onReaction?: (emoji: string, startBar: number, endBar: number, snapshot: string) => void;
		onRangeComment?: (startBar: number, endBar: number, snapshot: string) => void;
		onAiAnalyze?: (selectedChords: string) => void;
	}

	let {
		thread,
		scoreEditorValue,
		activeBarIndex,
		scoreDisplayMode,
		transposeSemitones,
		pendingInsertText,
		annotations = [],
		onScoreChange,
		onImport,
		onTransposeUp,
		onTransposeDown,
		onDisplayModeChange,
		onInsertBar,
		onInsertNewline,
		onDeleteLastLine,
		onReaction,
		onRangeComment,
		onAiAnalyze,
	}: Props = $props();

	let scoreEditorRef: ReturnType<typeof ScoreEditor> | undefined = $state();

	const lineCount = $derived(scoreEditorValue.split('\n').filter((l: string) => l.trim()).length);

	const handleAiTransformClick = () => {
		if (!scoreEditorRef?.openAiTransformFromSelection()) {
			alert('コードを選択してから「AI変更」をクリックしてください');
		}
	};
</script>

<div class="panel panel-main">
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
		<button class="score-tool-btn" onclick={onImport} title="コード譜をインポート">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			インポート
		</button>
		<button class="score-tool-btn score-tool-btn--danger" onclick={onDeleteLastLine} title="最終行を削除">
			最終行を削除
		</button>
		<div class="toolbar-spacer"></div>
		<button class="score-tool-btn score-tool-btn--ai" onclick={handleAiTransformClick} title="テキストを選択してからクリック">
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
			</svg>
			AI変更
		</button>
	</div>

	<div class="score-area">
		<ScoreEditor
			bind:this={scoreEditorRef}
			value={scoreEditorValue}
			readonly={false}
			{activeBarIndex}
			displayMode={scoreDisplayMode}
			musicalKey={thread.key}
			pendingInsert={pendingInsertText}
			threadId={thread.id}
			fullScore={scoreEditorValue}
			musicalKeyFull={thread.key}
			timeSignature={thread.timeSignature}
			bpm={thread.bpm}
			{annotations}
			onchange={onScoreChange}
			{onReaction}
			{onRangeComment}
			{onAiAnalyze}
		/>
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
		display: flex;
		flex-direction: column;
		flex: 1;
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

	.score-tool-btn--ai {
		color: var(--accent-primary);
	}

	.score-tool-btn--ai:hover {
		border-color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.1);
	}

	.toolbar-spacer {
		flex: 1;
	}

	.tool-label {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.85rem;
	}

	.score-area {
		padding: var(--space-sm) var(--space-md);
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.empty-score {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-xl);
		font-size: 0.85rem;
	}
</style>
