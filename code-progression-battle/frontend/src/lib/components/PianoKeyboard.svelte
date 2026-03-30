<script lang="ts">
	import { onMount } from 'svelte';

	let { collapsed = true, onToggle }: { collapsed?: boolean; onToggle?: (open: boolean) => void } = $props();

	let isCollapsed = $state(collapsed);
	let activeKeys = $state<Set<string>>(new Set());
	let scrollContainer: HTMLDivElement | undefined = $state();

	const OCTAVE_START = 1;
	const OCTAVE_END = 7; // C1 to B6 + C7
	const OCTAVE_COUNT = OCTAVE_END - OCTAVE_START; // 6 octaves

	const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const BLACK_NOTE_MAP: Record<string, { label: string; offsetIndex: number }> = {
		'C#': { label: 'C#', offsetIndex: 1 },
		'D#': { label: 'D#', offsetIndex: 2 },
		'F#': { label: 'F#', offsetIndex: 4 },
		'G#': { label: 'G#', offsetIndex: 5 },
		'A#': { label: 'A#', offsetIndex: 6 },
	};

	const WHITE_KEY_WIDTH = 40; // px fixed
	const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
	const TOTAL_WHITE_KEYS = OCTAVE_COUNT * 7 + 1; // +1 for final C7
	const TOTAL_WIDTH = TOTAL_WHITE_KEYS * WHITE_KEY_WIDTH;

	const buildKeys = () => {
		const whites: { note: string; label: string; left: number }[] = [];
		const blacks: { note: string; label: string; left: number }[] = [];

		let whiteIndex = 0;
		for (let o = 0; o < OCTAVE_COUNT; o++) {
			const oct = OCTAVE_START + o;
			for (const n of WHITE_NOTES) {
				whites.push({
					note: `${n}${oct}`,
					label: n === 'C' ? `C${oct}` : n,
					left: whiteIndex * WHITE_KEY_WIDTH
				});
				whiteIndex++;
			}
			for (const [name, info] of Object.entries(BLACK_NOTE_MAP)) {
				const bLeft = (o * 7 + info.offsetIndex) * WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
				blacks.push({ note: `${name}${oct}`, label: info.label, left: bLeft });
			}
		}
		// Add final C7
		whites.push({
			note: `C${OCTAVE_END}`,
			label: `C${OCTAVE_END}`,
			left: whiteIndex * WHITE_KEY_WIDTH
		});

		return { whites, blacks };
	};

	const keys = buildKeys();

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

	const toggleCollapse = () => {
		isCollapsed = !isCollapsed;
		onToggle?.(!isCollapsed);
	};

	// Scroll to C4 on mount / when opened
	const scrollToC4 = () => {
		if (!scrollContainer) return;
		// C4 is at octave index 3 (C1=0, C2=1, C3=2, C4=3)
		const c4WhiteIndex = (4 - OCTAVE_START) * 7; // white keys before C4
		const c4Left = c4WhiteIndex * WHITE_KEY_WIDTH;
		const containerWidth = scrollContainer.clientWidth;
		scrollContainer.scrollLeft = c4Left - containerWidth / 2 + WHITE_KEY_WIDTH / 2;
	};

	onMount(() => {
		if (!isCollapsed) {
			requestAnimationFrame(scrollToC4);
		}
	});

	$effect(() => {
		if (!isCollapsed && scrollContainer) {
			requestAnimationFrame(scrollToC4);
		}
	});
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
	</div>

	{#if !isCollapsed}
		<div class="piano-scroll" bind:this={scrollContainer}>
			<div class="piano-keys" style="width: {TOTAL_WIDTH}px">
				{#each keys.whites as key}
					<button
						class="wk"
						class:wk--active={activeKeys.has(key.note)}
						style="left: {key.left}px; width: {WHITE_KEY_WIDTH}px"
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
						style="left: {key.left}px; width: {BLACK_KEY_WIDTH}px"
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

	.piano-scroll {
		width: 100vw;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
	}

	/* Hide scrollbar but keep scrolling */
	.piano-scroll::-webkit-scrollbar {
		height: 4px;
	}
	.piano-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.piano-scroll::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
	}

	.piano-keys {
		position: relative;
		height: 80px;
		user-select: none;
		touch-action: none;
	}

	/* White keys */
	.wk {
		position: absolute;
		top: 0;
		height: 100%;
		background: #f0f0f0;
		border: 1px solid #c0c0c0;
		border-top: none;
		border-radius: 0 0 5px 5px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 8px;
		transition: background 0.08s;
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
		font-size: 0.55rem;
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
		top: 0;
		height: 52px;
		background: #2a2a2a;
		border: 1px solid #111;
		border-top: none;
		border-radius: 0 0 4px 4px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 5px;
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
		font-size: 0.42rem;
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
			height: 70px;
		}

		.bk {
			height: 45px;
		}
	}
</style>
