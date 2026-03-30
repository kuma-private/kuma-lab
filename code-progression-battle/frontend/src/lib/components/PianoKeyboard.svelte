<script lang="ts">
	let { collapsed = true, onToggle }: { collapsed?: boolean; onToggle?: (open: boolean) => void } = $props();

	let isCollapsed = $state(collapsed);
	let activeKeys = $state<Set<string>>(new Set());
	let octaveStart = $state(3);

	const OCTAVE_MIN = 2;
	const OCTAVE_MAX = 6;
	const OCTAVES_VISIBLE = 2;

	const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const BLACK_NOTE_MAP: Record<string, { label: string; offsetIndex: number }> = {
		'C#': { label: 'C#', offsetIndex: 1 },
		'D#': { label: 'D#', offsetIndex: 2 },
		'F#': { label: 'F#', offsetIndex: 4 },
		'G#': { label: 'G#', offsetIndex: 5 },
		'A#': { label: 'A#', offsetIndex: 6 },
	};

	// 2 octaves = 14 white keys, full screen width
	const TOTAL_WHITE_KEYS = 14;
	const BLACK_KEY_RATIO = 0.6;

	const buildKeys = (startOctave: number, count: number) => {
		const whites: { note: string; label: string }[] = [];
		const blacks: { note: string; label: string; leftPercent: number }[] = [];
		const whiteWidthPercent = 100 / TOTAL_WHITE_KEYS;
		const blackWidthPercent = whiteWidthPercent * BLACK_KEY_RATIO;

		for (let o = 0; o < count; o++) {
			const oct = startOctave + o;
			for (const n of WHITE_NOTES) {
				whites.push({ note: `${n}${oct}`, label: n === 'C' ? `C${oct}` : n });
			}
			for (const [name, info] of Object.entries(BLACK_NOTE_MAP)) {
				const whiteIndex = o * 7 + info.offsetIndex;
				const leftPercent = (whiteIndex + 1) * whiteWidthPercent - blackWidthPercent / 2;
				blacks.push({ note: `${name}${oct}`, label: info.label, leftPercent });
			}
		}

		return { whites, blacks, whiteWidthPercent, blackWidthPercent };
	};

	let keys = $derived(buildKeys(octaveStart, OCTAVES_VISIBLE));

	// Synth module loaded lazily
	let synthModule: typeof import('$lib/chord-player') | null = null;

	const ensureSynth = async () => {
		if (!synthModule) {
			synthModule = await import('$lib/chord-player');
		}
		return synthModule;
	};

	const handleKeyDown = async (note: string) => {
		if (activeKeys.has(note)) return;
		activeKeys = new Set([...activeKeys, note]);
		try {
			const mod = await ensureSynth();
			await mod.keyboardAttack([note]);
		} catch (err) {
			console.error('[PianoKeyboard] attack error:', err);
		}
	};

	const handleKeyUp = (note: string) => {
		if (!activeKeys.has(note)) return;
		const next = new Set(activeKeys);
		next.delete(note);
		activeKeys = next;
		try {
			synthModule?.keyboardRelease([note]);
		} catch (err) {
			console.error('[PianoKeyboard] release error:', err);
		}
	};

	const handlePointerLeave = (note: string) => {
		handleKeyUp(note);
	};

	const shiftOctave = (delta: number) => {
		const next = octaveStart + delta;
		if (next >= OCTAVE_MIN && next + OCTAVES_VISIBLE - 1 <= OCTAVE_MAX) {
			octaveStart = next;
		}
	};

	const toggleCollapse = () => {
		isCollapsed = !isCollapsed;
		onToggle?.(!isCollapsed);
	};

	const canShiftDown = $derived(octaveStart > OCTAVE_MIN);
	const canShiftUp = $derived(octaveStart + OCTAVES_VISIBLE <= OCTAVE_MAX);
</script>

<div class="piano-dock" class:piano-dock--open={!isCollapsed}>
	<div class="piano-toolbar">
		<button class="piano-toggle-btn" onclick={toggleCollapse}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M9 18V5l12-2v13" />
				<circle cx="6" cy="18" r="3" />
				<circle cx="18" cy="16" r="3" />
			</svg>
			<span>鍵盤</span>
			<svg
				class="piano-chevron"
				class:piano-chevron--open={!isCollapsed}
				width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
			>
				<polyline points="4,6 8,10 12,6" />
			</svg>
		</button>
		{#if !isCollapsed}
			<div class="octave-controls">
				<button class="octave-btn" onclick={() => shiftOctave(-1)} disabled={!canShiftDown} title="低いオクターブ">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="10,2 4,8 10,14" /></svg>
				</button>
				<span class="octave-label">C{octaveStart}–B{octaveStart + OCTAVES_VISIBLE - 1}</span>
				<button class="octave-btn" onclick={() => shiftOctave(1)} disabled={!canShiftUp} title="高いオクターブ">
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,2 12,8 6,14" /></svg>
				</button>
			</div>
		{/if}
	</div>

	{#if !isCollapsed}
		<div class="piano-full">
			<div class="piano-keys">
				{#each keys.whites as key}
					<button
						class="wk"
						class:wk--active={activeKeys.has(key.note)}
						style="width: {keys.whiteWidthPercent}%"
						onpointerdown={() => handleKeyDown(key.note)}
						onpointerup={() => handleKeyUp(key.note)}
						onpointerleave={() => handlePointerLeave(key.note)}
					>
						<span class="wk-label">{key.label}</span>
					</button>
				{/each}

				{#each keys.blacks as key}
					<button
						class="bk"
						class:bk--active={activeKeys.has(key.note)}
						style="left: {key.leftPercent}%; width: {keys.blackWidthPercent}%"
						onpointerdown={() => handleKeyDown(key.note)}
						onpointerup={() => handleKeyUp(key.note)}
						onpointerleave={() => handlePointerLeave(key.note)}
					>
						<span class="bk-label">{key.label}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.piano-dock {
		position: fixed;
		bottom: var(--player-height);
		left: 0;
		right: 0;
		width: 100vw;
		z-index: 49;
		background: rgba(10, 10, 26, 0.95);
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--border-subtle);
	}

	.piano-toolbar {
		display: flex;
		align-items: center;
		padding: 0 var(--space-lg);
		height: 32px;
	}

	.piano-toggle-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		padding: 4px 0;
		transition: color 0.15s;
	}

	.piano-toggle-btn:hover {
		color: var(--text-primary);
	}

	.piano-chevron {
		transition: transform 0.2s;
	}

	.piano-chevron--open {
		transform: rotate(180deg);
	}

	.octave-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}

	.octave-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.octave-btn:hover:not(:disabled) {
		background: var(--bg-hover);
		border-color: var(--accent-primary);
		color: var(--accent-primary);
	}

	.octave-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.octave-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		min-width: 56px;
		text-align: center;
	}

	.piano-full {
		width: 100vw;
		padding: 0;
	}

	.piano-keys {
		position: relative;
		display: flex;
		width: 100%;
		height: 100px;
		user-select: none;
		touch-action: none;
	}

	/* White keys */
	.wk {
		flex: none;
		height: 100%;
		background: #f0f0f0;
		border: 1px solid #c0c0c0;
		border-top: none;
		border-radius: 0 0 5px 5px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 10px;
		transition: background 0.08s;
		position: relative;
		z-index: 1;
		box-shadow: inset 0 -4px 6px rgba(0, 0, 0, 0.06), 0 2px 3px rgba(0, 0, 0, 0.15);
	}

	.wk:hover {
		background: #e4e4e4;
	}

	.wk--active {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.wk-label {
		font-size: 0.6rem;
		font-family: var(--font-mono);
		color: #888;
		font-weight: 600;
		pointer-events: none;
	}

	.wk--active .wk-label {
		color: #fff;
	}

	/* Black keys */
	.bk {
		position: absolute;
		height: 65px;
		background: #2a2a2a;
		border: 1px solid #111;
		border-top: none;
		border-radius: 0 0 4px 4px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 6px;
		transition: background 0.08s;
		z-index: 2;
		box-shadow: 0 3px 5px rgba(0, 0, 0, 0.4), inset 0 -2px 3px rgba(255, 255, 255, 0.05);
	}

	.bk:hover {
		background: #3a3a3a;
	}

	.bk--active {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.bk-label {
		font-size: 0.45rem;
		font-family: var(--font-mono);
		color: #666;
		font-weight: 600;
		pointer-events: none;
	}

	.bk--active .bk-label {
		color: #fff;
	}

	@media (max-width: 700px) {
		.piano-keys {
			height: 85px;
		}

		.bk {
			height: 55px;
		}
	}
</style>
