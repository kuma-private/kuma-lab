<script lang="ts">
	import { extractRoot } from '$lib/chord-parser';
	import { chordToDegree } from '$lib/chord-suggest';

	export type DisplayMode = 'chord' | 'degree';

	interface Props {
		value: string;
		readonly?: boolean;
		activeBarIndex?: number;
		displayMode?: DisplayMode;
		musicalKey?: string;
		onchange?: (value: string) => void;
	}

	let { value, readonly = false, activeBarIndex = -1, displayMode = 'chord', musicalKey = 'C', onchange }: Props = $props();

	// Color map for root notes
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

	const colorize = (text: string, activeBar: number, mode: DisplayMode, key: string): string => {
		// Track bar index across all lines: bars are segments between | delimiters
		let barCounter = 0;

		return text.split('\n').map(line => {
			if (line.trim().startsWith('#')) {
				return `<span class="se-comment">${escapeHtml(line)}</span>`;
			}
			const parts = line.split(/(\|)/);
			// Count how many | are in this line to know how many bars
			let insideBar = false;
			return parts.map(segment => {
				if (segment === '|') {
					if (insideBar) {
						// Closing a bar
						barCounter++;
					}
					insideBar = true;
					return '<span class="se-bar">|</span>';
				}
				const isActive = activeBar >= 0 && insideBar && barCounter === activeBar;
				const tokenized = segment.split(/(\s+)/).map(token => {
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
				return tokenized;
			}).join('');
		}).join('\n');
	};

	const escapeHtml = (s: string): string => {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	};

	let highlighted = $derived(colorize(value, activeBarIndex, displayMode, musicalKey));

	const handleInput = (e: Event) => {
		const target = e.target as HTMLTextAreaElement;
		onchange?.(target.value);
	};

	// ── Context menu (right-click for selection playback) ──
	let contextMenu = $state<{ x: number; y: number; text: string } | null>(null);

	const handleContextMenu = (e: MouseEvent) => {
		const textarea = e.target as HTMLTextAreaElement;
		const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
		if (!selected) return; // no selection, use default browser menu

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

	// ── Double-click chord preview ──
	// ── Drag & drop from CircleOfFifths ──
	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		const chord = e.dataTransfer?.getData('text/plain')?.trim();
		if (!chord) return;

		const textarea = e.target as HTMLTextAreaElement;
		const pos = textarea.selectionStart ?? value.length;
		const before = value.slice(0, pos);
		const after = value.slice(pos);
		// Insert chord with space padding
		const spaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') && !before.endsWith('|') ? ' ' : '';
		const spaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n') && !after.startsWith('|') ? ' ' : '';
		const newValue = before + spaceBefore + chord + spaceAfter + after;
		onchange?.(newValue);
	};

	// ── Double-click chord preview ──
	const handleDblClick = async (e: MouseEvent) => {
		const textarea = e.target as HTMLTextAreaElement;
		const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
		if (!selected) return;

		// Check if the selected word looks like a chord
		try {
			extractRoot(selected);
		} catch {
			return; // not a chord
		}

		try {
			const { playChordPreview } = await import('$lib/chord-player');
			await playChordPreview(selected);
		} catch (err) {
			console.error('[ScoreEditor] preview error:', err);
		}
	};
</script>

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
	<div class="se-container">
		<!-- Highlighted overlay -->
		<div class="se-highlight" aria-hidden="true">{@html highlighted}&nbsp;</div>
		<!-- Actual textarea -->
		<textarea
			class="se-textarea"
			{value}
			oninput={handleInput}
			oncontextmenu={handleContextMenu}
			ondblclick={handleDblClick}
			ondragover={handleDragOver}
			ondrop={handleDrop}
			readonly={readonly || displayMode === 'degree'}
			spellcheck="false"
			placeholder="# Chords will appear here&#10;G | D | Em | B7 |&#10;C | G | Am7 | D7 |"
		></textarea>
	</div>
</div>

<style>
	.score-editor {
		position: relative;
		width: 100%;
	}

	.se-container {
		position: relative;
		min-height: 200px;
		background: var(--bg-base);
		border: 1px solid transparent;
		transition: border-color 0.2s;
	}

	.se-container:focus-within {
		border-color: var(--accent-primary);
	}

	.se-highlight,
	.se-textarea {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 2;
		letter-spacing: 0;
		word-spacing: normal;
		padding: var(--space-md);
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-wrap: break-word;
		box-sizing: border-box;
		border: none;
	}

	.se-highlight {
		position: absolute;
		inset: 0;
		pointer-events: none;
		color: transparent;
		z-index: 1;
	}

	.se-textarea {
		position: relative;
		width: 100%;
		min-height: 200px;
		background: transparent;
		color: rgba(232, 232, 240, 0.05);
		caret-color: var(--accent-primary);
		outline: none;
		resize: vertical;
		z-index: 2;
	}

	.se-textarea::selection {
		background: rgba(167, 139, 250, 0.3);
	}

	.se-textarea::placeholder {
		color: var(--text-muted);
	}

	.se-textarea[readonly] {
		cursor: default;
	}

	:global(.se-bar) {
		color: var(--border-strong);
		font-weight: 500;
		margin: 0 2px;
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
		transition: background 0.15s;
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
