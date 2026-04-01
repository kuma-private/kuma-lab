<script lang="ts">
	import { onMount } from 'svelte';
	import { extractRoot } from '$lib/chord-parser';
	import { chordToDegree } from '$lib/chord-suggest';

	export type DisplayMode = 'chord' | 'degree';

	interface Props {
		value: string;
		readonly?: boolean;
		activeBarIndex?: number;
		displayMode?: DisplayMode;
		musicalKey?: string;
		pendingInsert?: string;
		threadId?: string;
		fullScore?: string;
		musicalKeyFull?: string;
		timeSignature?: string;
		bpm?: number;
		onchange?: (value: string) => void;
	}

	let { value, readonly = false, activeBarIndex = -1, displayMode = 'chord', musicalKey = 'C', pendingInsert = '', threadId = '', fullScore = '', musicalKeyFull = 'C Major', timeSignature = '4/4', bpm = 120, onchange }: Props = $props();

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

	const escapeHtml = (s: string): string =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	const colorize = (text: string, activeBar: number, mode: DisplayMode, key: string, insertedText: string): string => {
		let barCounter = 0;
		return text.split('\n').map(line => {
			if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
				return `<span class="se-comment">${escapeHtml(line)}</span>`;
			}
			const parts = line.split(/(\|)/);
			let insideBar = false;
			return parts.map(segment => {
				if (segment === '|') {
					if (insideBar) barCounter++;
					insideBar = true;
					return '<span class="se-bar">|</span>';
				}
				const isActive = activeBar >= 0 && insideBar && barCounter === activeBar;
				return segment.split(/(\s+)/).map(token => {
					if (!token.trim()) return token;
					if (token === '%' || token === '_' || token === '=' || token === '-') {
						return `<span class="se-special">${token}</span>`;
					}
					try {
						const root = extractRoot(token);
						const color = ROOT_COLORS[root] || 'var(--text-primary)';
						const activeClass = isActive ? ' se-active' : '';
						const insertClass = insertedText && token === insertedText ? ' se-just-inserted' : '';
						if (mode === 'degree') {
							const degree = chordToDegree(token, key);
							return `<span class="se-degree${activeClass}${insertClass}">${escapeHtml(degree)}</span>`;
						}
						const rootLen = root.length;
						const rootDisplay = escapeHtml(token.slice(0, rootLen)).replace(/b$/, '♭');
						const qualityDisplay = escapeHtml(token.slice(rootLen)).replace(/b(\d)/g, '♭$1');
						return `<span class="${activeClass}${insertClass}" style="color:${color}"><strong>${rootDisplay}</strong><span class="se-quality">${qualityDisplay}</span></span>`;
					} catch {
						return `<span class="se-invalid" title="無効なコード: ${escapeHtml(token)}">${escapeHtml(token)}</span>`;
					}
				}).join('');
			}).join('');
		}).join('\n');
	};

	// State
	let internalValue = $state(value);
	let textareaEl: HTMLTextAreaElement;
	let previewEl: HTMLDivElement;
	let lastCursorPos = $state(-1); // -1 = end
	let lastInsertedText = $state('');

	const handleScroll = () => {
		if (textareaEl && previewEl) {
			previewEl.scrollTop = textareaEl.scrollTop;
		}
	};

	// Handle pending insert at cursor position
	// pendingInsert format: "text::timestamp" to allow repeated same-text inserts
	let lastProcessedInsert = '';
	$effect(() => {
		const pi = pendingInsert;
		if (!pi || pi === lastProcessedInsert) return;
		lastProcessedInsert = pi;

		const currentVal = internalValue;
		const sepIdx = pi.lastIndexOf('::');
		const text = sepIdx >= 0 ? pi.slice(0, sepIdx) : pi;
		if (!text) return;

		const pos = lastCursorPos >= 0 ? lastCursorPos : currentVal.length;
		const before = currentVal.slice(0, pos);
		const after = currentVal.slice(pos);
		const space = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') && !before.endsWith('|') ? ' ' : '';
		const newVal = before + space + text + after;

		internalValue = newVal;
		if (textareaEl) textareaEl.value = newVal;
		onchange?.(newVal);
		lastCursorPos = pos + space.length + text.length;
		lastInsertedText = text;
		setTimeout(() => { lastInsertedText = ''; }, 500);
	});

	$effect(() => { internalValue = value; });

	onMount(() => {
		requestAnimationFrame(() => {
			if (textareaEl) { textareaEl.value = value; internalValue = value; }
		});
	});

	$effect(() => {
		if (textareaEl && textareaEl.value !== internalValue) {
			textareaEl.value = internalValue;
		}
	});

	const highlighted = $derived(colorize(internalValue, activeBarIndex, displayMode, musicalKey, lastInsertedText));

	// Convert chord text to degree text for display in textarea
	const toDegreeText = (text: string, key: string): string => {
		return text.split('\n').map(line => {
			const trimmed = line.trim();
			if (trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed) return line;
			return line.split(/(\|)/).map(segment => {
				if (segment === '|') return segment;
				return segment.split(/(\s+)/).map(token => {
					if (!token.trim() || token === '%' || token === '_' || token === '=' || token === '-') return token;
					try {
						return chordToDegree(token, key);
					} catch {
						return token;
					}
				}).join('');
			}).join('');
		}).join('\n');
	};

	const displayValue = $derived(displayMode === 'degree' ? toDegreeText(internalValue, musicalKey) : internalValue);

	const handleInput = (e: Event) => {
		const target = e.target as HTMLTextAreaElement;
		internalValue = target.value;
		onchange?.(target.value);
	};

	const handleBlur = () => {
		if (textareaEl) lastCursorPos = textareaEl.selectionStart;
	};

	// Right-click context menu
	let contextMenu = $state<{ x: number; y: number; text: string } | null>(null);

	const handleContextMenu = (e: MouseEvent) => {
		if (!textareaEl) return;
		const selected = textareaEl.value.substring(textareaEl.selectionStart, textareaEl.selectionEnd).trim();
		if (!selected) return;
		e.preventDefault();
		contextMenu = { x: e.clientX, y: e.clientY, text: selected };
	};

	const handlePlaySelection = async () => {
		if (!contextMenu) return;
		const text = contextMenu.text;
		contextMenu = null;
		try {
			const { playSelection } = await import('$lib/chord-player');
			const [tsBeats, tsValue] = timeSignature.split('/').map(Number);
			await playSelection(text, { bpm, timeSignature: { beats: tsBeats || 4, beatValue: tsValue || 4 } });
		} catch (err) {
			console.error('[ScoreEditor] playSelection error:', err);
		}
	};

	const closeContextMenu = () => { contextMenu = null; };

	// AI Transform state
	let aiTransform = $state<{ selectedText: string; selectionStart: number; selectionEnd: number } | null>(null);
	let aiInstruction = $state('');
	let aiLoading = $state(false);
	let aiComment = $state('');

	const handleOpenAiTransform = () => {
		if (!contextMenu || !textareaEl) return;
		aiTransform = {
			selectedText: contextMenu.text,
			selectionStart: textareaEl.selectionStart,
			selectionEnd: textareaEl.selectionEnd
		};
		aiInstruction = '';
		contextMenu = null;
	};

	export const openAiTransformFromSelection = () => {
		if (!textareaEl) return false;
		const selected = textareaEl.value.substring(textareaEl.selectionStart, textareaEl.selectionEnd).trim();
		if (!selected) return false;
		aiTransform = {
			selectedText: selected,
			selectionStart: textareaEl.selectionStart,
			selectionEnd: textareaEl.selectionEnd,
		};
		aiInstruction = '';
		return true;
	};

	const handleCancelAiTransform = () => {
		aiTransform = null;
		aiInstruction = '';
	};

	const handleSubmitAiTransform = async () => {
		if (!aiTransform || !aiInstruction.trim() || !threadId) return;
		aiLoading = true;
		try {
			const { transformChords } = await import('$lib/api');
			const result = await transformChords(threadId, {
				selectedChords: aiTransform.selectedText,
				instruction: aiInstruction.trim(),
				key: musicalKeyFull,
				timeSignature: timeSignature,
				fullScore: fullScore || internalValue
			});
			// Replace selected text with AI result
			const before = internalValue.slice(0, aiTransform.selectionStart);
			const after = internalValue.slice(aiTransform.selectionEnd);
			const newVal = before + result.chords + after;
			internalValue = newVal;
			if (textareaEl) textareaEl.value = newVal;
			onchange?.(newVal);
			aiTransform = null;
			aiInstruction = '';
			// Show comment briefly
			if (result.comment) {
				aiComment = result.comment;
				setTimeout(() => { aiComment = ''; }, 3000);
			}
		} catch (err) {
			console.error('[ScoreEditor] AI transform error:', err);
			aiComment = `エラー: ${err instanceof Error ? err.message : String(err)}`;
			setTimeout(() => { aiComment = ''; }, 3000);
		} finally {
			aiLoading = false;
		}
	};

	// Double-click chord preview
	const handleDblClick = async () => {
		if (!textareaEl) return;
		const selected = textareaEl.value.substring(textareaEl.selectionStart, textareaEl.selectionEnd).trim();
		if (!selected) return;
		try { extractRoot(selected); } catch { return; }
		try {
			const { playChordPreview } = await import('$lib/chord-player');
			await playChordPreview(selected);
		} catch (err) {
			console.error('[ScoreEditor] preview error:', err);
		}
	};
</script>

<!-- Context menu -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if contextMenu}
	<div class="ctx-overlay" onclick={closeContextMenu}></div>
	<div class="ctx-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px;">
		<button class="ctx-item" onclick={handlePlaySelection}>
			<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="4,2 14,8 4,14" />
			</svg>
			選択範囲を再生
		</button>
		{#if threadId}
			<button class="ctx-item" onclick={handleOpenAiTransform}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
				</svg>
				AIで変更...
			</button>
		{/if}
	</div>
{/if}

{#if aiComment}
	<div class="ai-toast">{aiComment}</div>
{/if}

<div class="score-editor">
	<div class="se-columns">
		<!-- Editor: textarea (left) -->
		<textarea
			bind:this={textareaEl}
			class="se-textarea"
			class:se-textarea--degree={displayMode === 'degree'}
			value={displayValue}
			oninput={handleInput}
			onblur={handleBlur}
			onscroll={handleScroll}
			oncontextmenu={handleContextMenu}
			ondblclick={handleDblClick}
			readonly={readonly || displayMode === 'degree'}
			autocomplete="off"
			spellcheck="false"
			placeholder={"// サビ\n| Am7 | Dm7 G7 | Cmaj7 |\n| C - - G | Am Em |\n\n|   小節区切り\n空白  拍分割 (| Am G | = 2拍ずつ)\n-   前コード伸ばし\n_   休符\n//  セクション名"}
		></textarea>

		<!-- Preview: colorized HTML (right) -->
		<div class="se-preview" bind:this={previewEl}>{@html highlighted}&nbsp;</div>
	</div>
</div>

{#if aiTransform}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="ai-modal-overlay" onclick={handleCancelAiTransform}></div>
	<div class="ai-modal">
		<div class="ai-modal-header">
			<span class="ai-modal-title">AI変更</span>
			<button class="ai-modal-close" onclick={handleCancelAiTransform} type="button" disabled={aiLoading}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="3" y1="3" x2="13" y2="13" />
					<line x1="13" y1="3" x2="3" y2="13" />
				</svg>
			</button>
		</div>
		<div class="ai-modal-body">
			<div class="ai-transform-selected">選択: <code>{aiTransform.selectedText}</code></div>
			<textarea
				class="ai-instruction-input"
				bind:value={aiInstruction}
				placeholder="指示を入力... 例: もっとジャジーに"
				rows="3"
				disabled={aiLoading}
				onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSubmitAiTransform(); } }}
			></textarea>
			{#if aiComment}
				<div class="ai-modal-comment">{aiComment}</div>
			{/if}
		</div>
		<div class="ai-modal-footer">
			<button class="ai-btn ai-btn-cancel" onclick={handleCancelAiTransform} disabled={aiLoading}>
				キャンセル
			</button>
			<button class="ai-btn ai-btn-submit" onclick={handleSubmitAiTransform} disabled={aiLoading || !aiInstruction.trim()}>
				{#if aiLoading}
					<span class="ai-spinner"></span>
					変更中...
				{:else}
					変更
				{/if}
			</button>
		</div>
	</div>
{/if}

<style>
	.score-editor {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.se-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		flex: 1;
		min-height: 0;
	}

	/* Colorized preview */
	.se-preview {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 500;
		line-height: 1.7;
		padding: var(--space-md);
		background: var(--bg-base);
		border-left: 1px solid var(--border-subtle);
		min-height: 120px;
		white-space: pre-wrap;
		word-wrap: break-word;
		box-sizing: border-box;
		overflow-y: hidden;
	}

	/* Textarea editor */
	.se-textarea {
		width: 100%;
		min-height: 120px;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 500;
		line-height: 1.7;
		padding: var(--space-md);
		background: var(--bg-base);
		color: var(--text-primary);
		border: none;
		caret-color: var(--accent-primary);
		outline: none;
		resize: none;
		box-sizing: border-box;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.se-textarea:focus {
		background: rgba(167, 139, 250, 0.02);
	}

	.se-textarea::placeholder {
		color: var(--text-muted);
	}

	.se-textarea[readonly] {
		opacity: 0.6;
		cursor: default;
	}

	.se-textarea--degree {
		opacity: 1;
		color: var(--accent-primary);
	}

	@media (max-width: 600px) {
		.se-columns {
			grid-template-columns: 1fr;
		}
		.se-preview {
			border-left: none;
			border-top: 1px solid var(--border-subtle);
		}
	}

	:global(.se-bar) {
		color: var(--border-strong);
		font-weight: 500;
	}

	:global(.se-special) {
		color: var(--text-muted);
		font-style: italic;
	}

	:global(.se-invalid) {
		color: var(--error);
		text-decoration: wavy underline var(--error);
		text-underline-offset: 3px;
		cursor: help;
	}

	:global(.se-comment) {
		color: var(--text-secondary);
		font-style: italic;
	}

	:global(.se-quality) {
		font-weight: 400;
		opacity: 0.75;
		font-size: 0.85em;
	}

	:global(.se-degree) {
		color: var(--accent-primary);
		font-weight: 600;
	}

	:global(.se-active) {
		background: rgba(167, 139, 250, 0.3);
		border-radius: 4px;
		padding: 1px 2px;
	}

	:global(.se-just-inserted) {
		animation: chord-flash 0.5s ease-out;
	}

	@keyframes chord-flash {
		0% {
			background: rgba(167, 139, 250, 0.5);
			border-radius: 4px;
		}
		100% {
			background: transparent;
		}
	}

	/* Context menu */
	.ctx-overlay {
		position: fixed;
		inset: 0;
		z-index: 90;
	}

	.ctx-menu {
		position: fixed;
		z-index: 91;
		background: rgba(20, 20, 50, 0.95);
		backdrop-filter: blur(8px);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-elevated);
		padding: 4px;
		min-width: 160px;
	}

	.ctx-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-primary);
		font-size: 0.82rem;
		cursor: pointer;
		transition: background 0.1s;
	}

	.ctx-item:hover {
		background: var(--bg-hover);
	}

	/* AI Toast */
	.ai-toast {
		padding: 8px 12px;
		background: rgba(167, 139, 250, 0.15);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: 0.8rem;
		margin-bottom: 6px;
		animation: toast-fade 3s ease-out forwards;
	}

	@keyframes toast-fade {
		0%, 80% { opacity: 1; }
		100% { opacity: 0; }
	}

	/* AI Transform Modal */
	.ai-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
	}

	.ai-modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 480px;
		max-width: 90vw;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		z-index: 101;
		display: flex;
		flex-direction: column;
	}

	.ai-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
	}

	.ai-modal-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--accent-primary);
	}

	.ai-modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.ai-modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }

	.ai-modal-body {
		padding: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.ai-modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-top: 1px solid var(--border-subtle);
	}

	.ai-modal-comment {
		font-size: 0.78rem;
		color: var(--accent-secondary);
		padding: var(--space-sm) var(--space-md);
		background: rgba(96, 165, 250, 0.08);
		border-radius: var(--radius-sm);
	}

	.ai-transform-selected {
		font-size: 0.78rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ai-transform-selected code {
		background: var(--bg-base);
		padding: 2px 6px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.ai-instruction-input {
		width: 100%;
		font-size: 0.82rem;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--text-primary);
		resize: none;
		box-sizing: border-box;
		font-family: inherit;
	}

	.ai-instruction-input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	.ai-instruction-input::placeholder {
		color: var(--text-muted);
	}

	.ai-btn {
		padding: 4px 12px;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		display: flex;
		align-items: center;
		gap: 4px;
		transition: all 0.15s;
	}

	.ai-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.ai-btn-submit {
		background: var(--accent-primary);
		color: #fff;
	}

	.ai-btn-submit:hover:not(:disabled) {
		background: var(--accent-secondary);
	}

	.ai-btn-cancel {
		background: transparent;
		color: var(--text-secondary);
		border: 1px solid var(--border-default);
	}

	.ai-btn-cancel:hover:not(:disabled) {
		background: var(--bg-hover);
	}

	.ai-spinner {
		width: 10px;
		height: 10px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
