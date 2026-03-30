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

	function colorize(text: string): string {
		// Split into lines, process each
		return text.split('\n').map(line => {
			if (line.trim().startsWith('#')) {
				return `<span class="se-comment">${escapeHtml(line)}</span>`;
			}
			// Tokenize: split by | and spaces, colorize chord tokens
			return line.split(/(\|)/).map(segment => {
				if (segment === '|') return '<span class="se-bar">|</span>';
				// Split segment by spaces, colorize each token
				return segment.split(/(\s+)/).map(token => {
					if (!token.trim()) return token;
					if (token === '%' || token === '_' || token === '=') {
						return `<span class="se-special">${token}</span>`;
					}
					try {
						const root = extractRoot(token);
						const color = ROOT_COLORS[root] || 'var(--text-primary)';
						// Color the root, dim the quality
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
	}

	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	let highlighted = $derived(colorize(value));

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		onchange?.(target.value);
	}
</script>

<div class="score-editor">
	<div class="se-container">
		<!-- Highlighted overlay -->
		<div class="se-highlight" aria-hidden="true">{@html highlighted}&nbsp;</div>
		<!-- Actual textarea -->
		<textarea
			class="se-textarea"
			{value}
			oninput={handleInput}
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
</style>
