<script lang="ts">
	import { extractRoot } from '$lib/chord-parser';

	interface Props {
		value: string;
		readonly?: boolean;
		onchange?: (value: string) => void;
	}

	let { value, readonly = false, onchange }: Props = $props();

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

	const colorize = (text: string): string => {
		return text.split('\n').map(line => {
			if (line.trim().startsWith('#')) {
				return `<span class="se-comment">${escapeHtml(line)}</span>`;
			}
			return line.split(/(\|)/).map(segment => {
				if (segment === '|') return '<span class="se-bar">|</span>';
				return segment.split(/(\s+)/).map(token => {
					if (!token.trim()) return token;
					if (token === '%' || token === '_' || token === '=') {
						return `<span class="se-special">${token}</span>`;
					}
					try {
						const root = extractRoot(token);
						const color = ROOT_COLORS[root] || 'var(--text-primary)';
						const rootLen = root.length;
						const rootPart = token.slice(0, rootLen);
						const qualityPart = token.slice(rootLen);
						return `<span style="color:${color}"><strong>${escapeHtml(rootPart)}</strong><span class="se-quality">${escapeHtml(qualityPart)}</span></span>`;
					} catch {
						return escapeHtml(token);
					}
				}).join('');
			}).join('');
		}).join('\n');
	};

	const escapeHtml = (s: string): string => {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	};

	let highlighted = $derived(colorize(value));

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
			{readonly}
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
	}

	.se-highlight,
	.se-textarea {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		line-height: 2;
		padding: var(--space-md);
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-wrap: break-word;
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
		color: transparent;
		caret-color: var(--text-primary);
		border: none;
		outline: none;
		resize: vertical;
		z-index: 2;
	}

	.se-textarea::placeholder {
		color: var(--text-muted);
	}

	.se-textarea[readonly] {
		cursor: default;
	}

	:global(.se-bar) {
		color: var(--border-default);
		font-weight: 400;
		margin: 0 2px;
	}

	:global(.se-special) {
		color: var(--text-muted);
		font-style: italic;
	}

	:global(.se-comment) {
		color: var(--text-muted);
		font-style: italic;
	}

	:global(.se-quality) {
		font-weight: 400;
		opacity: 0.75;
		font-size: 0.85em;
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
