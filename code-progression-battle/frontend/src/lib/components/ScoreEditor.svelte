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
		onchange?: (value: string) => void;
	}

	let { value, readonly = false, activeBarIndex = -1, displayMode = 'chord', musicalKey = 'C', pendingInsert = '', threadId = '', fullScore = '', musicalKeyFull = 'C Major', timeSignature = '4/4', onchange }: Props = $props();

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
			if (line.trim().startsWith('#')) {
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
						const rootPart = token.slice(0, rootLen);
						const qualityPart = token.slice(rootLen);
						return `<span class="${activeClass}${insertClass}" style="color:${color}"><strong>${escapeHtml(rootPart)}</strong><span class="se-quality">${escapeHtml(qualityPart)}</span></span>`;
					} catch {
						return escapeHtml(token);
					}
				}).join('');
			}).join('');
		}).join('\n');
	};

	// State
	let internalValue = $state(value);
	let textareaEl: HTMLTextAreaElement;
	let lastCursorPos = $state(-1); // -1 = end
	let lastInsertedText = $state('');

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
			await playSelection(text, { bpm: 120, timeSignature: { beats: 4, beatValue: 4 } });
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
	<!-- Preview: always visible, colorized HTML -->
	<div class="se-preview">{@html highlighted}&nbsp;</div>

	<!-- Editor: always visible textarea -->
	<textarea
		bind:this={textareaEl}
		class="se-textarea"
		value={internalValue}
		oninput={handleInput}
		onblur={handleBlur}
		oncontextmenu={handleContextMenu}
		ondblclick={handleDblClick}
		readonly={readonly}
		autocomplete="off"
		spellcheck="false"
		placeholder="| Am7 | Dm7 | G7 | Cmaj7 |&#10;&#10;💡 選択して右クリック → 部分再生"
	></textarea>
</div>

{#if aiTransform}
	<div class="ai-transform-panel">
		<div class="ai-transform-header">AI変更</div>
		<div class="ai-transform-selected">選択: <code>{aiTransform.selectedText}</code></div>
		<div class="ai-transform-input">
			<textarea
				class="ai-instruction-input"
				bind:value={aiInstruction}
				placeholder="指示を入力... 例: もっとジャジーに"
				rows="2"
				disabled={aiLoading}
				onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitAiTransform(); } }}
			></textarea>
			<div class="ai-transform-actions">
				<button class="ai-btn ai-btn-submit" onclick={handleSubmitAiTransform} disabled={aiLoading || !aiInstruction.trim()}>
					{#if aiLoading}
						<span class="ai-spinner"></span>
						変更中...
					{:else}
						変更
					{/if}
				</button>
				<button class="ai-btn ai-btn-cancel" onclick={handleCancelAiTransform} disabled={aiLoading}>
					キャンセル
				</button>
			</div>
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

	/* Colorized preview (always visible, read-only) */
	.se-preview {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 1.8;
		padding: var(--space-md);
		background: var(--bg-base);
		border: 1px solid transparent;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		min-height: 30px;
		white-space: pre-wrap;
		word-wrap: break-word;
		box-sizing: border-box;
	}

	/* Textarea editor (always visible) */
	.se-textarea {
		width: 100%;
		min-height: 120px;
		flex: 1;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 1.6;
		padding: var(--space-md);
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-top: 1px solid var(--border-subtle);
		border-radius: 0 0 var(--radius-md) var(--radius-md);
		caret-color: var(--accent-primary);
		outline: none;
		resize: vertical;
		box-sizing: border-box;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.se-textarea:focus {
		border-color: var(--accent-primary);
	}

	.se-textarea::placeholder {
		color: var(--text-muted);
	}

	.se-textarea[readonly] {
		opacity: 0.6;
		cursor: default;
	}

	:global(.se-bar) {
		color: var(--border-strong);
		font-weight: 500;
	}

	:global(.se-special) {
		color: var(--text-muted);
		font-style: italic;
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

	/* AI Transform Panel */
	.ai-transform-panel {
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-md);
		background: var(--bg-surface);
		padding: 10px 12px;
		margin-top: 6px;
	}

	.ai-transform-header {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--accent-primary);
		margin-bottom: 6px;
	}

	.ai-transform-selected {
		font-size: 0.75rem;
		color: var(--text-secondary);
		margin-bottom: 8px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ai-transform-selected code {
		background: var(--bg-base);
		padding: 1px 4px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.ai-transform-input {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.ai-instruction-input {
		width: 100%;
		font-size: 0.8rem;
		padding: 6px 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		resize: none;
		box-sizing: border-box;
		font-family: inherit;
	}

	.ai-instruction-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.ai-instruction-input::placeholder {
		color: var(--text-muted);
	}

	.ai-transform-actions {
		display: flex;
		gap: 6px;
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
