<script lang="ts">
	import { onMount } from 'svelte';

	let {
		playingNotes = [] as string[],
	}: {
		playingNotes?: string[];
	} = $props();

	let activeKeys = $state<Set<string>>(new Set());
	let scrollContainer: HTMLDivElement | undefined = $state();

	const OCTAVE_START = 3;
	const OCTAVE_END = 6; // C3 to B5 + C6
	const OCTAVE_COUNT = OCTAVE_END - OCTAVE_START; // 3 octaves

	const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
	const BLACK_NOTE_MAP: Record<string, { label: string; offsetIndex: number }> = {
		'C#': { label: 'C#', offsetIndex: 1 },
		'D#': { label: 'D#', offsetIndex: 2 },
		'F#': { label: 'F#', offsetIndex: 4 },
		'G#': { label: 'G#', offsetIndex: 5 },
		'A#': { label: 'A#', offsetIndex: 6 },
	};

	const WHITE_KEY_WIDTH = 16;
	const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.6;
	const TOTAL_WHITE_KEYS = OCTAVE_COUNT * 7 + 1;
	const TOTAL_WIDTH = TOTAL_WHITE_KEYS * WHITE_KEY_WIDTH;

	let isMobile = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 500px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	const mobileScale = 0.5;
	const effectiveWhiteWidth = $derived(isMobile ? WHITE_KEY_WIDTH * mobileScale : WHITE_KEY_WIDTH);
	const effectiveBlackWidth = $derived(isMobile ? BLACK_KEY_WIDTH * mobileScale : BLACK_KEY_WIDTH);
	const effectiveTotalWidth = $derived(isMobile ? TOTAL_WIDTH * mobileScale : TOTAL_WIDTH);

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
		whites.push({
			note: `C${OCTAVE_END}`,
			label: `C${OCTAVE_END}`,
			left: whiteIndex * WHITE_KEY_WIDTH
		});

		return { whites, blacks };
	};

	const keys = buildKeys();

	const allKeys = [...keys.whites, ...keys.blacks];

	const playingSet = $derived(new Set(playingNotes));
	const isHighlighted = (note: string): boolean => activeKeys.has(note) || playingSet.has(note);

	// Auto-scroll to center on playing notes
	$effect(() => {
		if (playingNotes.length === 0 || !scrollContainer) return;

		const notePositions = playingNotes.map(note => {
			const noteIndex = allKeys.findIndex(k => k.note === note);
			if (noteIndex === -1) return -1;
			return allKeys[noteIndex].left;
		}).filter(x => x >= 0);

		if (notePositions.length === 0) return;

		const scale = isMobile ? mobileScale : 1;
		const minX = Math.min(...notePositions) * scale;
		const maxX = Math.max(...notePositions) * scale;
		const centerX = (minX + maxX) / 2;

		const scrollTarget = centerX - scrollContainer.clientWidth / 2;
		scrollContainer.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
	});

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

</script>

<div class="piano-scroll" bind:this={scrollContainer}>
	<div class="piano-keys" style="width: {effectiveTotalWidth}px">
		{#each keys.whites as key}
			{@const scale = isMobile ? mobileScale : 1}
			<button
				class="wk"
				class:wk--active={activeKeys.has(key.note)}
				class:wk--playing={playingSet.has(key.note)}
				style="left: {key.left * scale}px; width: {effectiveWhiteWidth}px"
				aria-label={key.note}
				onpointerdown={() => handleKeyDown(key.note)}
				onpointerup={() => handleKeyUp(key.note)}
				onpointerleave={() => handlePointerLeave(key.note)}
			>
				<span class="wk-label">{key.label}</span>
			</button>
		{/each}

		{#each keys.blacks as key}
			{@const scale = isMobile ? mobileScale : 1}
			<button
				class="bk"
				class:bk--active={activeKeys.has(key.note)}
				class:bk--playing={playingSet.has(key.note)}
				style="left: {key.left * scale}px; width: {effectiveBlackWidth}px"
				aria-label={key.note}
				onpointerdown={() => handleKeyDown(key.note)}
				onpointerup={() => handleKeyUp(key.note)}
				onpointerleave={() => handlePointerLeave(key.note)}
			>
				<span class="bk-label">{key.label}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.piano-scroll {
		width: 100%;
		height: 100%;
		overflow-x: auto;
		overflow-y: hidden;
		-webkit-overflow-scrolling: touch;
	}

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
		height: 100%;
		user-select: none;
		touch-action: none;
	}

	.wk {
		position: absolute;
		top: 0;
		height: 100%;
		background: #f0f0f0;
		border: 1px solid #c0c0c0;
		border-top: none;
		border-radius: 0 0 4px 4px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;
		transition: background 0.08s, box-shadow 0.08s;
		z-index: 1;
		box-shadow: inset 0 -3px 5px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.15);
	}

	.wk:hover {
		background: #e4e4e4;
	}

	.wk--active {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.wk--playing {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2), 0 0 8px rgba(232, 168, 76, 0.5);
	}

	.wk-label {
		font-size: 0.48rem;
		font-family: var(--font-mono);
		color: #888;
		font-weight: 600;
		pointer-events: none;
	}

	.wk--active .wk-label,
	.wk--playing .wk-label {
		color: #fff;
	}

	.bk {
		position: absolute;
		top: 0;
		height: 62%;
		background: #2a2a2a;
		border: 1px solid #111;
		border-top: none;
		border-radius: 0 0 3px 3px;
		cursor: pointer;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 3px;
		transition: background 0.08s, box-shadow 0.08s;
		z-index: 2;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 -2px 3px rgba(255, 255, 255, 0.05);
	}

	.bk:hover {
		background: #3a3a3a;
	}

	.bk--active {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.bk--playing {
		background: var(--accent-primary) !important;
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 6px rgba(232, 168, 76, 0.5);
	}

	.bk-label {
		font-size: 0.38rem;
		font-family: var(--font-mono);
		color: #666;
		font-weight: 600;
		pointer-events: none;
	}

	.bk--active .bk-label,
	.bk--playing .bk-label {
		color: #fff;
	}

	@media (max-width: 700px) {
		.wk-label {
			display: none;
		}

		.bk-label {
			display: none;
		}
	}
</style>
