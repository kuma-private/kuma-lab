<script lang="ts">
	import type { Thread, Annotation } from '$lib/api';
	import ScoreEditor, { type DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { extractRoot } from '$lib/chord-parser';

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
	let showColorLegend = $state(false);

	const COLOR_LEGEND = [
		{ note: 'C', color: 'var(--chord-c-text)' },
		{ note: 'D', color: 'var(--chord-d-text)' },
		{ note: 'E', color: 'var(--chord-e-text)' },
		{ note: 'F', color: 'var(--chord-f-text)' },
		{ note: 'G', color: 'var(--chord-g-text)' },
		{ note: 'A', color: 'var(--chord-a-text)' },
		{ note: 'B', color: 'var(--chord-b-text)' },
	];

	const lineCount = $derived(scoreEditorValue.split('\n').filter((l: string) => l.trim()).length);
	const isScoreEmpty = $derived(scoreEditorValue.trim().length < 3);

	const barCount = $derived.by(() => {
		// Count bars by counting | pairs. Each pair of | delimiters = 1 bar.
		const stripped = scoreEditorValue.replace(/\/\/.*$/gm, '');
		const pipes = (stripped.match(/\|/g) || []).length;
		return Math.max(0, Math.floor(pipes / 2));
	});

	const estimatedDuration = $derived.by(() => {
		if (barCount === 0 || thread.bpm <= 0) return '';
		const tsParts = thread.timeSignature.split('/').map(Number);
		const beatsPerBar = tsParts[0] || 4;
		const totalBeats = barCount * beatsPerBar;
		const totalSeconds = Math.round((totalBeats / thread.bpm) * 60);
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	});
	let showGuide = $state(true);
	let showChordFreq = $state(false);
	let tipDismissed = $state(false);

	const hasSections = $derived(scoreEditorValue.includes('//'));

	const contextualTip = $derived.by(() => {
		if (tipDismissed || isScoreEmpty) return null;
		if (barCount > 0 && barCount < 4) return 'もう少しコードを追加してみましょう';
		if (barCount >= 4 && !hasSections) return '// でセクション名を付けると見やすくなります';
		return null;
	});

	const ROOT_COLORS: Record<string, string> = {
		'C': 'var(--chord-c-text)',
		'C#': 'var(--chord-cs-text)', 'Db': 'var(--chord-cs-text)',
		'D': 'var(--chord-d-text)',
		'D#': 'var(--chord-ds-text)', 'Eb': 'var(--chord-ds-text)',
		'E': 'var(--chord-e-text)',
		'F': 'var(--chord-f-text)',
		'F#': 'var(--chord-fs-text)', 'Gb': 'var(--chord-fs-text)',
		'G': 'var(--chord-g-text)',
		'G#': 'var(--chord-gs-text)', 'Ab': 'var(--chord-gs-text)',
		'A': 'var(--chord-a-text)',
		'A#': 'var(--chord-as-text)', 'Bb': 'var(--chord-as-text)',
		'B': 'var(--chord-b-text)',
	};

	const uniqueChordCount = $derived.by(() => {
		const chords = new Set<string>();
		for (const line of scoreEditorValue.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed) continue;
			for (const segment of line.split(/\|/)) {
				for (const token of segment.split(/\s+/)) {
					if (!token.trim() || token === '%' || token === '_' || token === '=' || token === '-') continue;
					try { extractRoot(token); chords.add(token); } catch { /* not a chord */ }
				}
			}
		}
		return chords.size;
	});

	const chordFrequency = $derived.by(() => {
		const counts: Record<string, { count: number; root: string }> = {};
		for (const line of scoreEditorValue.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed) continue;
			for (const segment of line.split(/\|/)) {
				for (const token of segment.split(/\s+/)) {
					if (!token.trim() || token === '%' || token === '_' || token === '=' || token === '-') continue;
					try {
						const root = extractRoot(token);
						if (!counts[token]) counts[token] = { count: 0, root };
						counts[token].count++;
					} catch { /* not a chord */ }
				}
			}
		}
		return Object.entries(counts)
			.sort((a, b) => b[1].count - a[1].count)
			.slice(0, 5);
	});

	// Section navigation
	const sections = $derived.by(() => {
		const result: { name: string; lineIndex: number }[] = [];
		const lines = scoreEditorValue.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (trimmed.startsWith('//')) {
				const name = trimmed.replace(/^\/\/\s*/, '').trim();
				if (name) result.push({ name, lineIndex: i });
			}
		}
		return result;
	});

	let activeSectionIndex = $state(-1);

	// Track active section during playback based on activeBarIndex
	$effect(() => {
		if (sections.length === 0 || activeBarIndex < 0) {
			activeSectionIndex = -1;
			return;
		}
		// Find which section the current bar falls into by counting bars before each section
		const lines = scoreEditorValue.split('\n');
		let barsSoFar = 0;
		let currentSection = -1;
		for (let i = 0; i < lines.length; i++) {
			const trimmed = lines[i].trim();
			if (trimmed.startsWith('//')) {
				const idx = sections.findIndex(s => s.lineIndex === i);
				if (idx >= 0 && barsSoFar <= activeBarIndex) {
					currentSection = idx;
				}
			} else {
				const pipes = (trimmed.match(/\|/g) || []).length;
				barsSoFar += Math.max(0, Math.floor(pipes / 2));
			}
		}
		activeSectionIndex = currentSection;
	});

	const scrollToSection = (lineIndex: number) => {
		// Find the section comment element in the score editor via DOM
		const scoreArea = document.querySelector('.score-area');
		if (!scoreArea) return;
		// Look for section comment elements - they render as .score-comment or similar
		const allLines = scoreArea.querySelectorAll('[data-line-index]');
		for (const el of allLines) {
			if (Number(el.getAttribute('data-line-index')) === lineIndex) {
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				return;
			}
		}
		// Fallback: scroll to approximate position in the score area
		const editorEl = scoreArea.querySelector('.score-editor, [contenteditable], textarea');
		if (editorEl) {
			const totalLines = scoreEditorValue.split('\n').length;
			const ratio = lineIndex / totalLines;
			editorEl.scrollTop = editorEl.scrollHeight * ratio;
		}
	};

	// Auto-format score text
	const handleFormatScore = () => {
		let text = scoreEditorValue;
		// Normalize spacing around |
		text = text.replace(/\s*\|\s*/g, ' | ');
		// Clean up leading space on lines that start with |
		text = text.replace(/^\s*\|\s*/gm, '| ');
		// Ensure | at end of bars doesn't have trailing space before newline
		text = text.replace(/\s+$/gm, '');
		// Normalize blank lines (max 1 consecutive blank line)
		text = text.replace(/\n{3,}/g, '\n\n');
		// Trim leading/trailing whitespace of the whole text
		text = text.trim();
		if (text !== scoreEditorValue) {
			onScoreChange(text);
			showToast('整形しました', 'success');
		} else {
			showToast('変更はありません', 'info');
		}
	};

	const handleAiTransformClick = () => {
		if (!scoreEditorRef?.openAiTransformFromSelection()) {
			alert('コードを選択してから「AI変更」をクリックしてください');
		}
	};

	const handleCopyScore = async () => {
		try {
			await navigator.clipboard.writeText(scoreEditorValue);
			showToast('コピーしました', 'success');
		} catch {
			showToast('コピーに失敗しました', 'error');
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
					Key: {thread.key}
					{#if transposeSemitones !== 0}
						<span class="transpose-badge" class:transpose-badge--positive={transposeSemitones > 0} class:transpose-badge--negative={transposeSemitones < 0}>
							{transposeSemitones > 0 ? '+' : ''}{transposeSemitones}
						</span>
					{/if}
				</span>
				<button class="transpose-btn" onclick={onTransposeUp} title="半音上げ">+</button>
			</div>
			<span class="count">
			{barCount > 0 ? `${barCount}小節` : `${lineCount} lines`}{#if uniqueChordCount > 0} · {uniqueChordCount}種類{/if}{#if estimatedDuration} · 約{estimatedDuration}{/if}
			{#if chordFrequency.length > 0}
				<button class="freq-toggle" onclick={() => showChordFreq = !showChordFreq} title="よく使うコード" aria-expanded={showChordFreq}>
					{showChordFreq ? '▾' : '▸'}
				</button>
			{/if}
		</span>
		</div>
	</div>

	{#if showChordFreq && chordFrequency.length > 0}
		<div class="chord-freq">
			<span class="chord-freq-label">よく使うコード:</span>
			{#each chordFrequency as [chord, { count, root }]}
				<span class="chord-freq-item" style="color: {ROOT_COLORS[root] || 'var(--text-primary)'}">
					{chord}<span class="chord-freq-count">({count})</span>
				</span>
			{/each}
		</div>
	{/if}

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
		<button class="score-tool-btn" onclick={handleCopyScore} title="コード譜をコピー">
			&#x1F4CB; コピー
		</button>
		<div class="toolbar-spacer"></div>
		<button class="score-tool-btn score-tool-btn--ai" onclick={handleAiTransformClick} title="テキストを選択してからクリック">
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
			</svg>
			&#x2728; AI変更
		</button>
	</div>

	{#if isScoreEmpty && showGuide}
		<div class="quick-guide">
			<div class="guide-header">
				<span>使い方</span>
				<button class="guide-close" onclick={() => showGuide = false}>&#x2715;</button>
			</div>
			<div class="guide-content">
				<p><code>|</code> で小節区切り</p>
				<p><code>Am7 Dm7</code> 空白で拍分割</p>
				<p><code>-</code> 前のコードを伸ばす</p>
				<p><code>_</code> 休符</p>
				<p><code>//</code> セクション名</p>
			</div>
		</div>
	{/if}

	{#if contextualTip}
		<div class="contextual-tip">
			<span class="tip-icon">💡</span>
			<span class="tip-text">{contextualTip}</span>
			<button class="tip-dismiss" onclick={() => tipDismissed = true}>&#x2715;</button>
		</div>
	{/if}

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
		position: relative;
	}

	.score-tab {
		padding: 4px 12px 6px;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.score-tab:hover {
		color: var(--text-primary);
		background: rgba(255, 255, 255, 0.03);
	}

	.score-tab--active {
		background: var(--bg-elevated);
		color: var(--accent-primary);
		border-bottom-color: var(--accent-primary);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}


	.count {
		font-size: 0.75rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.freq-toggle {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.7rem;
		cursor: pointer;
		padding: 0 2px;
		opacity: 0.6;
		transition: opacity 0.15s;
	}

	.freq-toggle:hover { opacity: 1; }

	.chord-freq {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		background: rgba(232, 168, 76, 0.03);
		flex-wrap: wrap;
	}

	.chord-freq-label {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.chord-freq-item {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.chord-freq-count {
		font-weight: 400;
		opacity: 0.6;
		font-size: 0.68rem;
		margin-left: 1px;
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
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.transpose-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: var(--radius-full, 9999px);
		font-size: 0.68rem;
		font-weight: 700;
		line-height: 1.4;
	}

	.transpose-badge--positive {
		background: rgba(34, 197, 94, 0.15);
		color: rgb(34, 197, 94);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.transpose-badge--negative {
		background: rgba(249, 115, 22, 0.15);
		color: rgb(249, 115, 22);
		border: 1px solid rgba(249, 115, 22, 0.3);
	}

	/* Section navigation */
	.section-nav {
		display: flex;
		gap: 4px;
		padding: 4px var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
	}

	.section-nav::-webkit-scrollbar {
		display: none;
	}

	.section-pill {
		padding: 2px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-full, 9999px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.68rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.section-pill:hover {
		border-color: var(--accent-primary);
		color: var(--text-primary);
		background: rgba(232, 168, 76, 0.08);
	}

	.section-pill--active {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
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
		background: rgba(232, 168, 76, 0.1);
	}

	.toolbar-spacer {
		flex: 1;
	}

	.tool-label {
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 0.85rem;
	}

	.score-tool-btn--legend {
		font-size: 0.72rem;
		padding: 3px 6px;
	}

	.color-legend {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
		background: rgba(232, 168, 76, 0.04);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-label {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--text-muted);
	}

	.contextual-tip {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin: var(--space-xs) var(--space-md);
		padding: var(--space-xs) var(--space-sm);
		background: rgba(251, 191, 36, 0.06);
		border: 1px solid rgba(251, 191, 36, 0.15);
		border-radius: var(--radius-sm);
		animation: tip-in 0.3s ease;
	}

	@keyframes tip-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.tip-icon {
		font-size: 0.72rem;
		flex-shrink: 0;
	}

	.tip-text {
		font-size: 0.72rem;
		color: var(--text-secondary);
		flex: 1;
	}

	.tip-dismiss {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.68rem;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
		opacity: 0.5;
		transition: opacity 0.15s;
	}

	.tip-dismiss:hover {
		opacity: 1;
		color: var(--text-primary);
	}

	.score-area {
		padding: var(--space-sm) var(--space-md);
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.quick-guide {
		margin: var(--space-sm) var(--space-md);
		padding: var(--space-sm) var(--space-md);
		background: rgba(232, 168, 76, 0.06);
		border: 1px solid rgba(232, 168, 76, 0.15);
		border-radius: var(--radius-md);
	}

	.guide-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-xs);
	}

	.guide-header span {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--accent-primary);
	}

	.guide-close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		padding: 2px 4px;
		border-radius: var(--radius-sm);
		transition: color 0.15s;
	}

	.guide-close:hover {
		color: var(--text-primary);
	}

	.guide-content {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
	}

	.guide-content p {
		margin: 0;
		font-size: 0.72rem;
		color: var(--text-secondary);
	}

	.guide-content code {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-primary);
		background: var(--bg-elevated);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.empty-score {
		text-align: center;
		color: var(--text-muted);
		padding: var(--space-xl);
		font-size: 0.85rem;
	}

	@media (max-width: 600px) {
		.panel-header {
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		.score-toolbar {
			flex-wrap: wrap;
			gap: 6px;
		}

		.score-tool-btn {
			padding: 6px 10px;
			min-height: 44px;
		}

		.toolbar-spacer {
			display: none;
		}
	}
</style>
