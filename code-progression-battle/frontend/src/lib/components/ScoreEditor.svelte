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
		onchange?: (value: string) => void;
	}

	let { value, readonly = false, activeBarIndex = -1, displayMode = 'chord', musicalKey = 'C', pendingInsert = '', onchange }: Props = $props();

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

	const colorize = (text: string, activeBar: number, mode: DisplayMode, key: string): string => {
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
					if (token === '%' || token === '_' || token === '=') {
						return `<span class="se-special">${token}</span>`;
					}
					try {
						const root = extractRoot(token);
						const color = ROOT_COLORS[root] || 'var(--text-primary)';
						const activeClass = isActive ? ' se-active' : '';
						if (mode === 'degree') {
							const degree = chordToDegree(token, key);
							return `<span class="se-degree${activeClass}">${escapeHtml(degree)}</span>`;
						}
						const rootLen = root.length;
						const rootPart = token.slice(0, rootLen);
						const qualityPart = token.slice(rootLen);
						return `<span class="${activeClass}" style="color:${color}"><strong>${escapeHtml(rootPart)}</strong><span class="se-quality">${escapeHtml(qualityPart)}</span></span>`;
					} catch {
						return escapeHtml(token);
					}
				}).join('');
			}).join('');
		}).join('\n');
	};

	// State
	let internalValue = $state(value);
	let editing = $state(false);
	let textareaEl: HTMLTextAreaElement;
	let lastCursorPos = $state(-1); // -1 = end

	// Handle pending insert at cursor position
	let lastPendingInsert = '';
	$effect(() => {
		if (pendingInsert && pendingInsert !== lastPendingInsert) {
			lastPendingInsert = pendingInsert;
			const pos = lastCursorPos >= 0 ? lastCursorPos : internalValue.length;
			const before = internalValue.slice(0, pos);
			const after = internalValue.slice(pos);
			const space = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') && !before.endsWith('|') ? ' ' : '';
			const newVal = before + space + pendingInsert + after;
			internalValue = newVal;
			if (textareaEl) textareaEl.value = newVal;
			onchange?.(newVal);
			lastCursorPos = pos + space.length + pendingInsert.length;
		}
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

	const highlighted = $derived(colorize(internalValue, activeBarIndex, displayMode, musicalKey));

	const handleInput = (e: Event) => {
		const target = e.target as HTMLTextAreaElement;
		internalValue = target.value;
		onchange?.(target.value);
	};

	const handleFocus = () => { editing = true; };
	const handleBlur = () => {
		if (textareaEl) lastCursorPos = textareaEl.selectionStart;
		editing = false;
	};

	// Right-click context menu
	let contextMenu = $state<{ x: number; y: number; text: string } | null>(null);

	const handleContextMenu = (e: MouseEvent) => {
		if (!editing || !textareaEl) return;
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

	// Drag & drop
	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const chord = e.dataTransfer?.getData('text/plain')?.trim();
		if (!chord || readonly) return;
		if (!textareaEl) return;
		const pos = textareaEl.selectionStart ?? internalValue.length;
		const before = internalValue.slice(0, pos);
		const after = internalValue.slice(pos);
		const spaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') && !before.endsWith('|') ? ' ' : '';
		const spaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n') && !after.startsWith('|') ? ' ' : '';
		const newVal = before + spaceBefore + chord + spaceAfter + after;
		internalValue = newVal;
		textareaEl.value = newVal;
		onchange?.(newVal);
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
	</div>
{/if}

<div class="score-editor">
	{#if editing && !readonly && displayMode === 'chord'}
		<!-- Editing mode: plain textarea -->
		<textarea
			bind:this={textareaEl}
			class="se-plain"
			value={internalValue}
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			oncontextmenu={handleContextMenu}
			ondblclick={handleDblClick}
			ondragover={handleDragOver}
			ondrop={handleDrop}
			autocomplete="off"
			spellcheck="false"
			placeholder="| Am7 | Dm7 | G7 | Cmaj7 |"
		></textarea>
	{:else}
		<!-- Display mode: colorized HTML -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="se-display"
			class:se-display--editable={!readonly && displayMode === 'chord'}
			onclick={() => { if (!readonly && displayMode === 'chord') editing = true; }}
			role={!readonly && displayMode === 'chord' ? 'textbox' : undefined}
			tabindex={!readonly && displayMode === 'chord' ? 0 : undefined}
			onfocus={() => { if (!readonly && displayMode === 'chord') editing = true; }}
		>{@html highlighted}&nbsp;</div>
		<!-- Hidden textarea for value sync -->
		<textarea bind:this={textareaEl} class="se-hidden" value={internalValue} tabindex="-1"></textarea>
	{/if}
</div>

<style>
	.score-editor {
		position: relative;
		width: 100%;
		min-height: 150px;
	}

	/* Plain textarea for editing */
	.se-plain {
		width: 100%;
		min-height: 150px;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 2;
		padding: var(--space-md);
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-md);
		caret-color: var(--accent-primary);
		outline: none;
		resize: vertical;
		box-sizing: border-box;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.se-plain::placeholder {
		color: var(--text-muted);
	}

	/* Colorized display */
	.se-display {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 2;
		padding: var(--space-md);
		background: var(--bg-base);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		min-height: 150px;
		white-space: pre-wrap;
		word-wrap: break-word;
		box-sizing: border-box;
		transition: border-color 0.2s;
	}

	.se-display--editable {
		cursor: text;
	}

	.se-display--editable:hover {
		border-color: var(--border-default);
	}

	.se-hidden {
		position: absolute;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
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
</style>
