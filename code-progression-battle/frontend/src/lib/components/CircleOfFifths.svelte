<script lang="ts">
	interface Props {
		currentKey?: string;
		onSelect?: (chord: string) => void;
		onInsert?: (chord: string) => void;
	}

	let { currentKey = 'C', onSelect, onInsert }: Props = $props();

	let selectedRoot = $state<string | null>(null);
	let selectedQuality = $state('');

	// Circle of fifths order
	const MAJOR_ROOTS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
	const MINOR_ROOTS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];

	const QUALITIES = ['', 'maj7', '7', 'm', 'm7', 'add9', 'dim', 'sus4', 'sus2', 'aug', '9', '6'];
	const QUALITY_LABELS = ['M', 'M7', '7', 'm', 'm7', 'add9', 'dim', 'sus4', 'sus2', 'aug', '9', '6'];

	// Diatonic chords per major key
	const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	const ENHARMONIC: Record<string, string> = {
		'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
	};
	const SHARP_TO_FLAT: Record<string, string> = {
		'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
	};

	const pitchIndex = (name: string): number => {
		const n = ENHARMONIC[name] ?? name;
		return PITCH_NAMES.indexOf(n);
	};

	// Major scale intervals: W W H W W W H
	const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
	// Diatonic chord qualities: I ii iii IV V vi vii°
	const DIATONIC_QUALITIES = ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim'];

	const getDiatonicChords = (key: string): Set<string> => {
		const rootIdx = pitchIndex(key);
		if (rootIdx === -1) return new Set();
		const chords = new Set<string>();

		for (let i = 0; i < 7; i++) {
			const noteIdx = (rootIdx + MAJOR_INTERVALS[i]) % 12;
			const noteName = PITCH_NAMES[noteIdx];
			const flat = SHARP_TO_FLAT[noteName];
			const quality = DIATONIC_QUALITIES[i];

			if (quality === 'major') {
				chords.add(noteName);
				if (flat) chords.add(flat);
			} else if (quality === 'minor') {
				chords.add(noteName + 'm');
				if (flat) chords.add(flat + 'm');
			} else {
				chords.add(noteName + 'dim');
				if (flat) chords.add(flat + 'dim');
			}
		}
		return chords;
	};

	let diatonicSet = $derived(getDiatonicChords(currentKey));

	const isDiatonic = (chordLabel: string): boolean => {
		return diatonicSet.has(chordLabel);
	};

	// Color mapping for roots
	const ROOT_COLOR_MAP: Record<string, string> = {
		'C': 'var(--chord-c-text)', 'C#': 'var(--chord-cs-text)', 'Db': 'var(--chord-cs-text)',
		'D': 'var(--chord-d-text)', 'D#': 'var(--chord-ds-text)', 'Eb': 'var(--chord-ds-text)',
		'E': 'var(--chord-e-text)', 'F': 'var(--chord-f-text)',
		'F#': 'var(--chord-fs-text)', 'Gb': 'var(--chord-fs-text)',
		'G': 'var(--chord-g-text)', 'G#': 'var(--chord-gs-text)', 'Ab': 'var(--chord-gs-text)',
		'A': 'var(--chord-a-text)', 'A#': 'var(--chord-as-text)', 'Bb': 'var(--chord-as-text)',
		'B': 'var(--chord-b-text)',
	};

	const ROOT_BG_MAP: Record<string, string> = {
		'C': 'var(--chord-c-bg)', 'C#': 'var(--chord-cs-bg)', 'Db': 'var(--chord-cs-bg)',
		'D': 'var(--chord-d-bg)', 'D#': 'var(--chord-ds-bg)', 'Eb': 'var(--chord-ds-bg)',
		'E': 'var(--chord-e-bg)', 'F': 'var(--chord-f-bg)',
		'F#': 'var(--chord-fs-bg)', 'Gb': 'var(--chord-fs-bg)',
		'G': 'var(--chord-g-bg)', 'G#': 'var(--chord-gs-bg)', 'Ab': 'var(--chord-gs-bg)',
		'A': 'var(--chord-a-bg)', 'A#': 'var(--chord-as-bg)', 'Bb': 'var(--chord-as-bg)',
		'B': 'var(--chord-b-bg)',
	};

	const getRootFromLabel = (label: string): string => {
		return label.replace(/m$/, '');
	};

	// SVG geometry
	const CX = 200;
	const CY = 200;
	const R_OUTER = 180;
	const R_MID = 135;
	const R_INNER = 95;
	const R_CENTER = 55;
	const SEGMENT_COUNT = 12;
	const ANGLE_STEP = (2 * Math.PI) / SEGMENT_COUNT;
	const START_OFFSET = -Math.PI / 2 - ANGLE_STEP / 2; // Start so C is at top

	const arcPath = (index: number, rOuter: number, rInner: number): string => {
		const a1 = START_OFFSET + index * ANGLE_STEP;
		const a2 = a1 + ANGLE_STEP;

		const x1o = CX + rOuter * Math.cos(a1);
		const y1o = CY + rOuter * Math.sin(a1);
		const x2o = CX + rOuter * Math.cos(a2);
		const y2o = CY + rOuter * Math.sin(a2);
		const x1i = CX + rInner * Math.cos(a2);
		const y1i = CY + rInner * Math.sin(a2);
		const x2i = CX + rInner * Math.cos(a1);
		const y2i = CY + rInner * Math.sin(a1);

		return `M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 0 0 ${x2i} ${y2i} Z`;
	};

	const labelPos = (index: number, radius: number): { x: number; y: number } => {
		const angle = START_OFFSET + index * ANGLE_STEP + ANGLE_STEP / 2;
		return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
	};

	const currentChordName = $derived(() => {
		if (!selectedRoot) return '';
		// If root already has 'm' suffix and quality starts with 'm', avoid doubling
		if (selectedRoot.endsWith('m') && !selectedQuality) return selectedRoot;
		if (selectedRoot.endsWith('m') && selectedQuality === 'm') return selectedRoot;
		if (selectedRoot.endsWith('m') && selectedQuality.startsWith('m')) {
			return getRootFromLabel(selectedRoot) + selectedQuality;
		}
		return selectedRoot + selectedQuality;
	});

	const handleChordClick = async (label: string, isMinor: boolean) => {
		selectedRoot = label;
		if (isMinor && selectedQuality === '') {
			// Keep as minor
		} else if (isMinor && selectedQuality === 'm') {
			selectedQuality = '';
		}

		const chordName = buildChordName(label);
		onSelect?.(chordName);

		try {
			const { playChordPreview } = await import('$lib/chord-player');
			await playChordPreview(chordName);
		} catch (err) {
			console.error('[CircleOfFifths] preview error:', err);
		}
	};

	const handleChordDblClick = (label: string) => {
		const chordName = buildChordName(label);
		onInsert?.(chordName);
	};

	const buildChordName = (label: string): string => {
		if (!selectedQuality) return label;
		if (label.endsWith('m')) {
			if (selectedQuality === 'm') return label;
			if (selectedQuality.startsWith('m')) return getRootFromLabel(label) + selectedQuality;
			return getRootFromLabel(label) + selectedQuality;
		}
		return label + selectedQuality;
	};

	const handleQualityClick = (q: string) => {
		selectedQuality = selectedQuality === q ? '' : q;
		if (selectedRoot) {
			const chordName = buildChordName(selectedRoot);
			onSelect?.(chordName);
		}
	};

	let hovered = $state<string | null>(null);
</script>

<div class="cof-container">
	<!-- Quality selector -->
	<div class="cof-qualities">
		{#each QUALITIES as q, i}
			<button
				class="cof-q-btn"
				class:cof-q-btn--active={selectedQuality === q}
				onclick={() => handleQualityClick(q)}
			>
				{QUALITY_LABELS[i]}
			</button>
		{/each}
	</div>

	<!-- SVG Circle -->
	<svg viewBox="0 0 400 400" class="cof-svg" xmlns="http://www.w3.org/2000/svg">
		<!-- Outer ring: Major chords -->
		{#each MAJOR_ROOTS as label, i}
			{@const root = getRootFromLabel(label)}
			{@const diatonic = isDiatonic(label)}
			{@const isSelected = selectedRoot === label}
			{@const isHovered = hovered === label}
			<path
				d={arcPath(i, R_OUTER, R_MID)}
				class="cof-segment cof-segment--outer"
				class:cof-segment--diatonic={diatonic}
				class:cof-segment--selected={isSelected}
				class:cof-segment--hovered={isHovered}
				style={isHovered || isSelected ? `fill: ${ROOT_BG_MAP[root] ?? 'var(--bg-hover)'}` : ''}
				onclick={() => handleChordClick(label, false)}
				ondblclick={() => handleChordDblClick(label)}
				onpointerenter={() => { hovered = label; }}
				onpointerleave={() => { hovered = null; }}
				role="button"
				tabindex="0"
			/>
			{@const pos = labelPos(i, (R_OUTER + R_MID) / 2)}
			<text
				x={pos.x}
				y={pos.y}
				class="cof-label cof-label--outer"
				class:cof-label--diatonic={diatonic}
				class:cof-label--selected={isSelected}
				style={isHovered || isSelected ? `fill: ${ROOT_COLOR_MAP[root] ?? 'var(--text-primary)'}` : ''}
				dominant-baseline="central"
				text-anchor="middle"
				pointer-events="none"
			>{label}</text>
		{/each}

		<!-- Inner ring: Minor chords -->
		{#each MINOR_ROOTS as label, i}
			{@const root = getRootFromLabel(label)}
			{@const diatonic = isDiatonic(label)}
			{@const isSelected = selectedRoot === label}
			{@const isHovered = hovered === label}
			<path
				d={arcPath(i, R_MID, R_INNER)}
				class="cof-segment cof-segment--inner"
				class:cof-segment--diatonic={diatonic}
				class:cof-segment--selected={isSelected}
				class:cof-segment--hovered={isHovered}
				style={isHovered || isSelected ? `fill: ${ROOT_BG_MAP[root] ?? 'var(--bg-hover)'}` : ''}
				onclick={() => handleChordClick(label, true)}
				ondblclick={() => handleChordDblClick(label)}
				onpointerenter={() => { hovered = label; }}
				onpointerleave={() => { hovered = null; }}
				role="button"
				tabindex="0"
			/>
			{@const pos = labelPos(i, (R_MID + R_INNER) / 2)}
			<text
				x={pos.x}
				y={pos.y}
				class="cof-label cof-label--inner"
				class:cof-label--diatonic={diatonic}
				class:cof-label--selected={isSelected}
				style={isHovered || isSelected ? `fill: ${ROOT_COLOR_MAP[root] ?? 'var(--text-primary)'}` : ''}
				dominant-baseline="central"
				text-anchor="middle"
				pointer-events="none"
			>{label}</text>
		{/each}

		<!-- Center circle: current selection -->
		<circle cx={CX} cy={CY} r={R_CENTER} class="cof-center" />
		<text x={CX} y={CY - 8} class="cof-center-text" dominant-baseline="central" text-anchor="middle">
			{currentChordName() || currentKey}
		</text>
		<text x={CX} y={CY + 16} class="cof-center-sub" dominant-baseline="central" text-anchor="middle">
			Key: {currentKey}
		</text>
	</svg>
</div>

<style>
	.cof-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) 0;
	}

	.cof-qualities {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px;
		padding: 0 var(--space-sm);
	}

	.cof-q-btn {
		padding: 3px 8px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s;
	}

	.cof-q-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
		border-color: var(--border-default);
	}

	.cof-q-btn--active {
		background: rgba(167, 139, 250, 0.2);
		color: var(--accent-primary);
		border-color: var(--accent-primary);
	}

	.cof-svg {
		width: 100%;
		max-width: 340px;
		height: auto;
	}

	.cof-segment {
		fill: var(--bg-surface);
		stroke: var(--border-subtle);
		stroke-width: 1;
		cursor: pointer;
		transition: fill 0.12s, opacity 0.12s;
	}

	.cof-segment--inner {
		fill: var(--bg-base);
	}

	.cof-segment:not(.cof-segment--diatonic) {
		opacity: 0.45;
	}

	.cof-segment--diatonic {
		opacity: 1;
	}

	.cof-segment--selected {
		opacity: 1;
		stroke: var(--accent-primary);
		stroke-width: 2;
		filter: drop-shadow(0 0 6px rgba(167, 139, 250, 0.4));
	}

	.cof-segment--hovered {
		opacity: 1;
		stroke: var(--border-strong);
		stroke-width: 1.5;
	}

	.cof-label {
		font-family: var(--font-mono);
		font-weight: 700;
		fill: var(--text-muted);
		pointer-events: none;
		user-select: none;
	}

	.cof-label--outer {
		font-size: 14px;
	}

	.cof-label--inner {
		font-size: 11px;
	}

	.cof-label--diatonic {
		fill: var(--text-primary);
	}

	.cof-label--selected {
		fill: var(--accent-primary);
	}

	.cof-center {
		fill: var(--bg-deepest);
		stroke: var(--border-default);
		stroke-width: 1.5;
	}

	.cof-center-text {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
		fill: var(--accent-primary);
	}

	.cof-center-sub {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--text-muted);
	}
</style>
