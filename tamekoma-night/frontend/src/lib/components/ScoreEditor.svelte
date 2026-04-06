<script lang="ts">
	import { onMount } from 'svelte';
	import { extractRoot } from '$lib/chord-parser';
	import { chordToDegree } from '$lib/chord-suggest';
	import type { Annotation } from '$lib/api';

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
		annotations?: Annotation[];
		onchange?: (value: string) => void;
		onReaction?: (emoji: string, startBar: number, endBar: number, snapshot: string) => void;
		onRangeComment?: (startBar: number, endBar: number, snapshot: string) => void;
		onAiAnalyze?: (selectedChords: string) => void;
	}

	let { value, readonly = false, activeBarIndex = -1, displayMode = 'chord', musicalKey = 'C', pendingInsert = '', threadId = '', fullScore = '', musicalKeyFull = 'C Major', timeSignature = '4/4', bpm = 120, annotations = [], onchange, onReaction, onRangeComment, onAiAnalyze }: Props = $props();

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

	const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches;

	// Gesture hint for first-time mobile users
	let showGestureHint = $state(false);

	// Tooltip for desktop chord hover
	let tooltipEl: HTMLDivElement | undefined = $state();

	function handlePreviewMouseOver(e: MouseEvent) {
		if (isMobile || !tooltipEl) return;
		const target = e.target as HTMLElement;
		const chordEl = target.closest('[data-chord-name]') as HTMLElement | null;
		if (!chordEl) {
			tooltipEl.style.display = 'none';
			return;
		}
		const chordName = chordEl.getAttribute('data-chord-name');
		if (!chordName) { tooltipEl.style.display = 'none'; return; }
		const degree = chordToDegree(chordName, musicalKey);
		tooltipEl.textContent = degree;
		const rect = chordEl.getBoundingClientRect();
		tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
		tooltipEl.style.top = `${rect.top - 4}px`;
		tooltipEl.style.transform = 'translate(-50%, -100%)';
		tooltipEl.style.display = 'block';
	}

	function handlePreviewMouseOut(e: MouseEvent) {
		if (isMobile || !tooltipEl) return;
		const related = e.relatedTarget as HTMLElement | null;
		if (!related || !related.closest?.('[data-chord-name]')) {
			tooltipEl.style.display = 'none';
		}
	}

	const escapeHtml = (s: string): string =>
		s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	// --- Helper functions for chord text manipulation ---
	interface ChordPosition {
		line: number;
		token: number;
		chord: string;
		start: number;
		end: number;
	}

	function parseChordPositions(text: string): ChordPosition[] {
		const positions: ChordPosition[] = [];
		let offset = 0;
		text.split('\n').forEach((line, lineIdx) => {
			if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
				offset += line.length + 1;
				return;
			}
			let tokenIdx = 0;
			const parts = line.split(/(\|)/);
			let localOffset = offset;
			for (const segment of parts) {
				if (segment === '|') {
					localOffset += 1;
					continue;
				}
				const tokens = segment.split(/(\s+)/);
				for (const tok of tokens) {
					if (tok.trim() && tok !== '%' && tok !== '_' && tok !== '=' && tok !== '-') {
						try {
							extractRoot(tok);
							positions.push({
								line: lineIdx,
								token: tokenIdx,
								chord: tok,
								start: localOffset,
								end: localOffset + tok.length
							});
							tokenIdx++;
						} catch {
							// not a valid chord
						}
					}
					localOffset += tok.length;
				}
			}
			offset += line.length + 1;
		});
		return positions;
	}

	function removeChordAt(text: string, line: number, token: number): string {
		const positions = parseChordPositions(text);
		const target = positions.find(p => p.line === line && p.token === token);
		if (!target) return text;
		// Remove the chord and any trailing whitespace
		let start = target.start;
		let end = target.end;
		// Remove trailing spaces
		while (end < text.length && text[end] === ' ') end++;
		// If that leaves nothing before a |, also remove leading spaces
		if (start > 0 && text[start - 1] === ' ' && (end >= text.length || text[end] === '|' || text[end] === '\n')) {
			while (start > 0 && text[start - 1] === ' ') start--;
		}
		return text.slice(0, start) + text.slice(end);
	}

	function moveChord(text: string, fromLine: number, fromToken: number, toLine: number, toToken: number): string {
		const positions = parseChordPositions(text);
		const source = positions.find(p => p.line === fromLine && p.token === fromToken);
		if (!source) return text;
		// Remove the source chord first
		const afterRemove = removeChordAt(text, fromLine, fromToken);
		// Re-parse after removal to find the insertion point
		const newPositions = parseChordPositions(afterRemove);
		const target = newPositions.find(p => p.line === toLine && p.token === toToken);
		let insertPos: number;
		if (target) {
			insertPos = target.start;
		} else {
			// Insert at end of the target line
			const lines = afterRemove.split('\n');
			if (toLine < lines.length) {
				let offset = 0;
				for (let i = 0; i < toLine; i++) offset += lines[i].length + 1;
				insertPos = offset + lines[toLine].length;
			} else {
				insertPos = afterRemove.length;
			}
		}
		const needSpaceBefore = insertPos > 0 && afterRemove[insertPos - 1] !== ' ' && afterRemove[insertPos - 1] !== '|' && afterRemove[insertPos - 1] !== '\n';
		const needSpaceAfter = insertPos < afterRemove.length && afterRemove[insertPos] !== ' ' && afterRemove[insertPos] !== '|' && afterRemove[insertPos] !== '\n';
		const insert = (needSpaceBefore ? ' ' : '') + source.chord + (needSpaceAfter ? ' ' : '');
		return afterRemove.slice(0, insertPos) + insert + afterRemove.slice(insertPos);
	}

	const colorize = (text: string, activeBar: number, mode: DisplayMode, key: string, insertedText: string): string => {
		let barCounter = 0;
		let lineIdx = 0;
		let lineNum = 0;
		return text.split('\n').map(line => {
			const currentLineIdx = lineIdx++;
			lineNum++;
			const lineNumPrefix = !isMobile ? `<span class="se-line-num">${lineNum}</span>` : '';
			// Blank line: render with a zero-width space to preserve line height
			if (!line) {
				return `${lineNumPrefix}\u200B`;
			}
			if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
				return `${lineNumPrefix}<span class="se-comment">${escapeHtml(line)}</span>`;
			}
			const parts = line.split(/(\|)/);
			let insideBar = false;
			let tokenIdx = 0;
			const lineContent = parts.map(segment => {
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
						const interactiveAttr = isMobile ? ` data-chord-pos="${currentLineIdx}-${tokenIdx}" ` : '';
						const interactiveClass = isMobile ? ' se-chord-interactive' : '';
						const chordNameAttr = ` data-chord-name="${escapeHtml(token)}"`;
						tokenIdx++;
						if (mode === 'degree') {
							const degree = chordToDegree(token, key);
							return `<span class="se-degree${activeClass}${insertClass}${interactiveClass}"${interactiveAttr}${chordNameAttr}>${escapeHtml(degree)}</span>`;
						}
						const rootLen = root.length;
						const rootDisplay = escapeHtml(token.slice(0, rootLen)).replace(/b$/, '♭');
						const qualityDisplay = escapeHtml(token.slice(rootLen)).replace(/b(\d)/g, '♭$1');
						return `<span class="${activeClass}${insertClass}${interactiveClass}"${interactiveAttr}${chordNameAttr}style="color:${color}"><strong>${rootDisplay}</strong><span class="se-quality">${qualityDisplay}</span></span>`;
					} catch {
						return `<span class="se-invalid" title="無効なコード: ${escapeHtml(token)}">${escapeHtml(token)}</span>`;
					}
				}).join('');
			}).join('');
			return `${lineNumPrefix}${lineContent}`;
		}).join('\n');
	};

	// State
	let internalValue = $state(value);
	let textareaEl: HTMLTextAreaElement;
	let previewEl: HTMLDivElement;
	let lineNumEl: HTMLDivElement;
	let lastCursorPos = $state(-1); // -1 = end
	let lastInsertedText = $state('');

	const textareaLineNumbers = $derived(
		internalValue.split('\n').map((_, i) => i + 1).join('\n')
	);

	const handleScroll = () => {
		if (textareaEl && previewEl) previewEl.scrollTop = textareaEl.scrollTop;
		if (textareaEl && lineNumEl) lineNumEl.scrollTop = textareaEl.scrollTop;
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

		// Show gesture hint for first-time mobile users with empty content
		if (isMobile && !value.trim() && !localStorage.getItem('gesture-hint-shown')) {
			showGestureHint = true;
			localStorage.setItem('gesture-hint-shown', '1');
			setTimeout(() => { showGestureHint = false; }, 3000);
		}
	});

	$effect(() => {
		if (textareaEl && textareaEl.value !== internalValue) {
			textareaEl.value = internalValue;
		}
	});

	const highlighted = $derived(colorize(internalValue, activeBarIndex, displayMode, musicalKey, lastInsertedText));

	// Auto-scroll to active bar during playback (desktop only)
	$effect(() => {
		if (activeBarIndex < 0 || isMobile || !previewEl) return;
		requestAnimationFrame(() => {
			const activeEl = previewEl?.querySelector('.se-active');
			if (activeEl) {
				activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		});
	});

	// Count invalid chords for validation feedback
	const invalidChordCount = $derived.by(() => {
		let count = 0;
		for (const line of internalValue.split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith('#') || trimmed.startsWith('//') || !trimmed) continue;
			for (const segment of line.split(/\|/)) {
				for (const token of segment.split(/\s+/)) {
					if (!token.trim() || token === '%' || token === '_' || token === '=' || token === '-') continue;
					try { extractRoot(token); } catch { count++; }
				}
			}
		}
		return count;
	});

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

	const selectionToBars = (text: string, start: number, end: number): { startBar: number; endBar: number; snapshot: string } => {
		const snapshot = text.substring(start, end);
		let startBar = 0;
		let endBar = 0;
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '|') {
				if (i < start) startBar++;
				if (i < end) endBar++;
			}
		}
		return { startBar, endBar: Math.max(endBar, startBar), snapshot };
	};



	// Double-click chord preview with glow feedback
	const handleDblClick = async () => {
		if (!textareaEl) return;
		const selected = textareaEl.value.substring(textareaEl.selectionStart, textareaEl.selectionEnd).trim();
		if (!selected) return;
		try { extractRoot(selected); } catch { return; }

		// Find the matching chord in the preview and add glow
		const chordEls = previewEl?.querySelectorAll(`[data-chord-name="${selected}"]`);
		if (chordEls) {
			// Find the one closest to the cursor position - just glow all matching for simplicity
			chordEls.forEach(el => {
				el.classList.add('se-dblclick-glow');
				setTimeout(() => el.classList.remove('se-dblclick-glow'), 600);
			});
		}

		try {
			const { playChordPreview } = await import('$lib/chord-player');
			await playChordPreview(selected);
		} catch (err) {
			console.error('[ScoreEditor] preview error:', err);
		}
	};

	// --- Mobile touch interactions ---
	let undoStack: string[] = [];
	let hasUndo = $state(false);
	let deleteMode = $state(false);
	let selectionPlayMode = $state(false);
	let swapMode = $state(false);
	let swapFirst = $state<{ line: number; token: number } | null>(null);

	function toggleDeleteMode() {
		deleteMode = !deleteMode;
		if (deleteMode) { selectionPlayMode = false; swapMode = false; swapFirst = null; }
	}

	function toggleSelectionPlayMode() {
		selectionPlayMode = !selectionPlayMode;
		if (selectionPlayMode) { deleteMode = false; swapMode = false; swapFirst = null; }
		// Clear any remaining selection highlights
		previewEl?.querySelectorAll('.se-selection-playing').forEach(el => el.classList.remove('se-selection-playing'));
	}

	function toggleSwapMode() {
		swapMode = !swapMode;
		swapFirst = null;
		if (swapMode) { deleteMode = false; selectionPlayMode = false; }
	}

	function swapChords(text: string, lineA: number, tokenA: number, lineB: number, tokenB: number): string {
		const positions = parseChordPositions(text);
		const a = positions.find(p => p.line === lineA && p.token === tokenA);
		const b = positions.find(p => p.line === lineB && p.token === tokenB);
		if (!a || !b) return text;
		// Build result by replacing both chords
		const chars = [...text];
		// Replace in reverse offset order to preserve positions
		const first = a.start < b.start ? a : b;
		const second = a.start < b.start ? b : a;
		const firstChord = a.start < b.start ? b.chord : a.chord;
		const secondChord = a.start < b.start ? a.chord : b.chord;
		const result = text.slice(0, first.start) + firstChord + text.slice(first.end, second.start) + secondChord + text.slice(second.end);
		return result;
	}

	function appendToScore(symbol: string) {
		pushUndo();
		const currentVal = internalValue;
		const space = currentVal.length > 0 && !currentVal.endsWith(' ') && !currentVal.endsWith('\n') && !currentVal.endsWith('|') ? ' ' : '';
		const newVal = currentVal + space + symbol;
		internalValue = newVal;
		if (textareaEl) textareaEl.value = newVal;
		onchange?.(newVal);
	}

	async function handlePreviewClick(e: MouseEvent) {
		if (!isMobile) return;
		const target = e.target as HTMLElement;
		const chordEl = target.closest('[data-chord-pos]') as HTMLElement | null;
		if (!chordEl) return;
		const pos = getChordPos(chordEl);
		if (!pos) return;

		if (deleteMode) {
			chordEl.classList.add('se-chord-deleting');
			pushUndo();
			setTimeout(() => {
				const newVal = removeChordAt(internalValue, pos.line, pos.token);
				internalValue = newVal;
				if (textareaEl) textareaEl.value = newVal;
				onchange?.(newVal);
			}, 200);
			return;
		}

		if (swapMode) {
			if (!swapFirst) {
				// First selection
				swapFirst = { line: pos.line, token: pos.token };
				chordEl.classList.add('se-chord-swap-selected');
			} else {
				// Second selection - perform swap
				if (swapFirst.line === pos.line && swapFirst.token === pos.token) {
					// Same chord tapped, deselect
					chordEl.classList.remove('se-chord-swap-selected');
					swapFirst = null;
				} else {
					pushUndo();
					const newVal = swapChords(internalValue, swapFirst.line, swapFirst.token, pos.line, pos.token);
					internalValue = newVal;
					if (textareaEl) textareaEl.value = newVal;
					onchange?.(newVal);
					// Clear highlights
					previewEl?.querySelectorAll('.se-chord-swap-selected').forEach(el => el.classList.remove('se-chord-swap-selected'));
					swapFirst = null;
				}
			}
			return;
		}

		if (selectionPlayMode) {
			const positions = parseChordPositions(internalValue);
			const idx = positions.findIndex(p => p.line === pos.line && p.token === pos.token);
			if (idx < 0) return;
			// Use raw text from the tapped chord position to the end (preserving bar delimiters)
			const textFromHere = internalValue.slice(positions[idx].start);
			// Highlight from tapped chord onward
			positions.slice(idx).forEach(p => {
				const el = previewEl?.querySelector(`[data-chord-pos="${p.line}-${p.token}"]`);
				el?.classList.add('se-selection-playing');
			});
			try {
				const { playSelection } = await import('$lib/chord-player');
				const [tsBeats, tsValue] = (timeSignature ?? '4/4').split('/').map(Number);
				await playSelection(textFromHere, { bpm: bpm ?? 120, timeSignature: { beats: tsBeats || 4, beatValue: tsValue || 4 } });
			} catch (err) {
				console.error('[ScoreEditor] playSelection error:', err);
			} finally {
				previewEl?.querySelectorAll('.se-selection-playing').forEach(el => el.classList.remove('se-selection-playing'));
			}
			return;
		}
	}

	function pushUndo() {
		undoStack.push(internalValue);
		if (undoStack.length > 20) undoStack.shift();
		hasUndo = true;
	}

	function handleUndo() {
		const prev = undoStack.pop();
		if (prev !== undefined) {
			internalValue = prev;
			if (textareaEl) textareaEl.value = prev;
			onchange?.(prev);
		}
		hasUndo = undoStack.length > 0;
	}

	function getChordPos(el: HTMLElement): { line: number; token: number } | null {
		const attr = el.getAttribute('data-chord-pos') || el.closest('[data-chord-pos]')?.getAttribute('data-chord-pos');
		if (!attr) return null;
		const [line, token] = attr.split('-').map(Number);
		return { line, token };
	}
</script>

<!-- Context menu -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if contextMenu}
	<div class="ctx-overlay" onclick={closeContextMenu}></div>
	<div class="ctx-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px;" onmousedown={(e) => e.preventDefault()}>
		<button class="ctx-item" onclick={handlePlaySelection}>
			<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
				<polygon points="4,2 14,8 4,14" />
			</svg>
			選択範囲を再生
		</button>
		{#if threadId}
			<div class="ctx-sep"></div>
			<button class="ctx-item" onclick={() => { const r = selectionToBars(textareaEl!.value, textareaEl!.selectionStart, textareaEl!.selectionEnd); onReaction?.('👍', r.startBar, r.endBar, r.snapshot); closeContextMenu(); }}>
				👍 いいね
			</button>
			<button class="ctx-item" onclick={() => { const r = selectionToBars(textareaEl!.value, textareaEl!.selectionStart, textareaEl!.selectionEnd); onRangeComment?.(r.startBar, r.endBar, r.snapshot); closeContextMenu(); }}>
				💬 コメント
			</button>
			<div class="ctx-sep"></div>
			<button class="ctx-item" onclick={() => { const sel = textareaEl!.value.substring(textareaEl!.selectionStart, textareaEl!.selectionEnd).trim(); onAiAnalyze?.(sel); closeContextMenu(); }}>
				🤖 AI分析
			</button>
			<button class="ctx-item" onclick={handleOpenAiTransform}>
				✨ AIで変更...
			</button>
		{/if}
	</div>
{/if}

{#if aiComment}
	<div class="ai-toast">{aiComment}</div>
{/if}

{#if showGestureHint}
	<div class="gesture-hint">
		<span class="gesture-hint-arrow">←</span> スワイプで戻る
	</div>
{/if}

<div class="score-editor">
	<div class="se-mobile-toolbar">
		<button
			class="se-mode-btn se-mode-btn--delete"
			class:se-mode-btn--active={deleteMode}
			onclick={toggleDeleteMode}
			type="button"
		>🗑 削除</button>
		<button
			class="se-mode-btn se-mode-btn--swap"
			class:se-mode-btn--active={swapMode}
			onclick={toggleSwapMode}
			type="button"
		>↔ 並替</button>
		<button
			class="se-mode-btn"
			class:se-mode-btn--active={selectionPlayMode}
			onclick={toggleSelectionPlayMode}
			type="button"
		>▶ 選択再生</button>
		<button
			class="se-mode-btn"
			onclick={() => appendToScore('-')}
			type="button"
		>— 伸ばし</button>
		<button
			class="se-mode-btn"
			onclick={() => appendToScore('_')}
			type="button"
		>＿ 休符</button>
		{#if hasUndo}
			<button class="se-mode-btn" onclick={handleUndo} type="button">↩ 戻す</button>
		{/if}
	</div>
	{#if deleteMode}
		<div class="se-mode-banner se-mode-banner--delete">コードをタップして削除</div>
	{:else if swapMode}
		<div class="se-mode-banner se-mode-banner--accent">{swapFirst ? '2つ目のコードをタップして入れ替え' : '2つのコードをタップして入れ替え'}</div>
	{:else if selectionPlayMode}
		<div class="se-mode-banner se-mode-banner--accent">コードをタップしてそこから再生</div>
	{/if}
	{#if hasUndo}
		<button class="se-undo-btn" onclick={handleUndo} type="button">
			<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="1,4 1,10 7,10" />
				<path d="M3.51 5.05A7 7 0 1 1 1 10" />
			</svg>
			元に戻す
		</button>
	{/if}
	<div class="se-columns">
		<!-- Editor: textarea (left) -->
		<div class="se-textarea-wrapper">
			<div class="se-line-numbers" bind:this={lineNumEl}>{textareaLineNumbers}</div>
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
				placeholder={"// セクション名を書こう\n| Am7 | Dm7 G7 | Cmaj7 |\n\nスペースで拍分割  |で小節区切り\n-: 伸ばす  _: 休符  %: 繰り返し"}
			></textarea>
		</div>

		<!-- Preview: colorized HTML (right) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="se-preview"
			class:se-preview--delete-mode={deleteMode}
			class:se-preview--swap-mode={swapMode}
			bind:this={previewEl}
			onclick={handlePreviewClick}
			onmouseover={handlePreviewMouseOver}
			onmouseout={handlePreviewMouseOut}
		>{@html highlighted}&nbsp;
		{#if !internalValue.trim()}
			<div class="se-empty-hint">
				<p class="se-empty-title">コード進行を入力しましょう</p>
				<div class="se-empty-example">
					<span style="opacity:0.4">| Cmaj7 | Dm7 G7 | Cmaj7 |</span>
				</div>
				<p class="se-empty-sub">五度圏からコードを追加できます</p>
			</div>
		{/if}
		{#if invalidChordCount > 0}
			<div class="se-invalid-count">&#x26A0; {invalidChordCount}件の不明なコード</div>
		{/if}
		</div>
		<div class="se-chord-tooltip" bind:this={tooltipEl} style="display:none;"></div>
	</div>
</div>


{#if aiTransform}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="ai-modal-overlay" onclick={handleCancelAiTransform}></div>
	<div class="ai-modal">
		<div class="ai-modal-accent"></div>
		<div class="ai-modal-header">
			<span class="ai-modal-title">&#x2728; AI変更</span>
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
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
					</svg>
					変更を適用
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

	.se-preview::after {
		content: '';
		position: sticky;
		bottom: 0;
		display: block;
		height: 24px;
		background: linear-gradient(transparent, var(--bg-base));
		pointer-events: none;
	}

	/* Textarea editor */
	.se-textarea {
		flex: 1;
		min-height: 0;
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
		background: rgba(232, 168, 76, 0.02);
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

	.se-textarea-wrapper {
		display: flex;
		min-height: 120px;
		overflow: hidden;
	}

	.se-line-numbers {
		padding: var(--space-md) var(--space-xs) var(--space-md) var(--space-sm);
		font-family: var(--font-mono);
		font-size: 0.72em;
		line-height: calc(0.85rem * 1.7);
		color: var(--text-muted);
		opacity: 0.3;
		text-align: right;
		user-select: none;
		min-width: 2.5ch;
		white-space: pre-wrap;
		overflow: hidden;
		background: var(--bg-base);
	}

	@media (max-width: 600px) {
		.se-columns {
			grid-template-columns: 1fr;
		}
		.se-textarea-wrapper {
			display: none;
		}
		.se-preview {
			border-left: none;
			border-top: none;
			min-height: 200px;
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
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
		cursor: help;
		filter: brightness(1.3);
	}

	:global(.se-comment) {
		color: var(--text-secondary);
		font-style: italic;
	}

	:global(.se-line-num) {
		display: inline-block;
		width: 2ch;
		text-align: right;
		margin-right: 1ch;
		color: var(--text-muted);
		opacity: 0.3;
		font-size: 0.72em;
		line-height: inherit;
		user-select: none;
		vertical-align: baseline;
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
		background: linear-gradient(90deg, rgba(232, 168, 76, 0.15), transparent);
		border-left: 2px solid var(--accent-primary);
		border-radius: 4px;
		padding: 1px 2px 1px 4px;
		transition: background 0.1s ease;
	}

	:global(.se-just-inserted) {
		animation: chord-flash 0.5s ease-out;
	}

	@keyframes chord-flash {
		0% {
			background: rgba(232, 168, 76, 0.5);
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
		max-width: calc(100vw - 20px);
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

	.ctx-sep {
		height: 1px;
		background: var(--border-subtle);
		margin: 2px 4px;
	}

	/* AI Toast */
	.ai-toast {
		padding: 8px 12px;
		background: rgba(232, 168, 76, 0.15);
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

	.ai-modal-accent {
		height: 3px;
		background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), var(--accent-primary));
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		flex-shrink: 0;
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
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
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
		padding: 6px 18px;
		font-size: 0.82rem;
	}

	.ai-btn-submit:hover:not(:disabled) {
		background: var(--accent-secondary);
		box-shadow: 0 2px 12px rgba(232, 168, 76, 0.3);
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

	@media (max-width: 600px) {
		.ai-modal {
			width: 95vw;
		}

		.ai-btn {
			padding: 8px 14px;
			min-height: 40px;
		}
	}

	/* Mobile touch interactions */
	:global(.se-chord-interactive) {
		cursor: pointer;
		user-select: none;
		-webkit-user-select: none;
		transition: opacity 0.15s, transform 0.15s, background 0.15s;
		padding: 2px 4px;
		border-radius: 3px;
	}

	:global(.se-chord-swap-selected) {
		background: rgba(232, 168, 76, 0.4);
		outline: 2px solid var(--accent-primary);
		outline-offset: 1px;
		border-radius: 4px;
	}

	:global(.se-chord-deleting) {
		animation: chord-swipe-out 0.3s ease-out forwards;
	}

	@keyframes chord-swipe-out {
		to { opacity: 0; transform: translateX(-50px); }
	}

	.se-undo-btn {
		position: absolute;
		top: var(--space-xs);
		right: var(--space-xs);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.7rem;
		cursor: pointer;
		z-index: 5;
	}

	/* Mobile toolbar */
	.se-mobile-toolbar {
		display: none;
	}

	@media (max-width: 600px) {
		.se-mobile-toolbar {
			display: flex;
			gap: 4px;
			padding: var(--space-xs) var(--space-sm);
			border-bottom: 1px solid var(--border-subtle);
			align-items: center;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
			position: sticky;
			top: 0;
			z-index: 10;
			background: var(--bg-base);
		}

		.se-mobile-toolbar::-webkit-scrollbar {
			display: none;
		}

		.se-undo-btn {
			display: none;
		}
	}

	.se-mode-btn {
		padding: 4px 10px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-full, 9999px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.se-mode-btn--active {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
	}

	.se-mode-btn--delete.se-mode-btn--active {
		background: var(--error);
		border-color: var(--error);
	}

	.se-mode-banner {
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.se-mode-banner--delete {
		background: rgba(248, 113, 113, 0.12);
		color: var(--error);
		border-bottom: 1px solid rgba(248, 113, 113, 0.25);
	}

	.se-mode-banner--accent {
		background: rgba(232, 168, 76, 0.1);
		color: var(--accent-primary);
		border-bottom: 1px solid rgba(232, 168, 76, 0.2);
	}

	.se-preview--delete-mode {
		border: 2px solid var(--error) !important;
		border-radius: var(--radius-sm);
	}

	.se-preview--swap-mode {
		border: 2px solid var(--accent-primary) !important;
		border-radius: var(--radius-sm);
	}

	.se-mode-btn--swap.se-mode-btn--active {
		background: var(--accent-primary);
		border-color: var(--accent-primary);
	}

	:global(.se-selection-playing) {
		background: rgba(232, 168, 76, 0.35);
		border-radius: 4px;
		padding: 1px 3px;
	}

	.se-empty-hint {
		text-align: center;
		padding: var(--space-xl);
		color: var(--text-muted);
	}
	.se-empty-title {
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: var(--space-sm);
	}
	.se-empty-example {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		margin-bottom: var(--space-sm);
	}
	.se-empty-sub {
		font-size: 0.75rem;
	}

	/* Chord tooltip (desktop hover) */
	.se-chord-tooltip {
		position: fixed;
		z-index: 100;
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		padding: 2px 8px;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--accent-primary);
		pointer-events: none;
		box-shadow: var(--shadow-card);
		white-space: nowrap;
	}

	/* Invalid chord count */
	.se-invalid-count {
		margin-top: var(--space-sm);
		padding: 4px 8px;
		font-size: 0.72rem;
		color: var(--error);
		background: rgba(239, 68, 68, 0.08);
		border-radius: var(--radius-sm);
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	/* Double-click glow effect */
	:global(.se-dblclick-glow) {
		animation: chord-dblclick-glow 0.6s ease-out;
		border-radius: 4px;
	}

	@keyframes chord-dblclick-glow {
		0% {
			box-shadow: 0 0 8px 2px rgba(232, 168, 76, 0.7);
			background: rgba(232, 168, 76, 0.3);
		}
		100% {
			box-shadow: 0 0 0 0 transparent;
			background: transparent;
		}
	}

	/* Gesture hint for first-time mobile users */
	.gesture-hint {
		position: fixed;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 80;
		font-size: 0.82rem;
		color: var(--text-secondary);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 6px 14px;
		animation: gesture-hint-fade 3s ease-in-out forwards;
		pointer-events: none;
	}

	.gesture-hint-arrow {
		display: inline-block;
		animation: gesture-hint-slide 1s ease-in-out infinite;
		font-weight: 700;
	}

	@keyframes gesture-hint-fade {
		0% { opacity: 0; }
		10% { opacity: 1; }
		75% { opacity: 1; }
		100% { opacity: 0; }
	}

	@keyframes gesture-hint-slide {
		0%, 100% { transform: translateX(0); }
		50% { transform: translateX(-6px); }
	}

</style>
