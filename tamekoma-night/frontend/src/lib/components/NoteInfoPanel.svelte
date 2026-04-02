<script lang="ts">
	import type { PianoRollBar, PianoRollNote, PianoRollBarEntry } from '$lib/piano-roll-model';
	import { midiToNoteName } from '$lib/chord-player';

	interface Props {
		bars: PianoRollBar[];
		selectedNoteIds: Set<string>;
		ticksPerBar: number;
		onNoteUpdate: (noteId: string, updates: { midi?: number; velocity?: number; durationTicks?: number; startTick?: number; isChordTone?: boolean }) => void;
	}

	let {
		bars,
		selectedNoteIds,
		ticksPerBar,
		onNoteUpdate,
	}: Props = $props();

	const TICKS_PER_QUARTER = 480;

	const DURATION_PRESETS = [
		{ label: '1/1', ticks: 1920 },
		{ label: '1/2', ticks: 960 },
		{ label: '1/4', ticks: 480 },
		{ label: '1/8', ticks: 240 },
		{ label: '1/16', ticks: 120 },
	];

	// ── Selected notes collection ────────────────────────

	interface SelectedInfo {
		note: PianoRollNote;
		entry: PianoRollBarEntry;
		barIndex: number;
	}

	let selectedInfos = $derived.by((): SelectedInfo[] => {
		const result: SelectedInfo[] = [];
		for (const bar of bars) {
			for (const entry of bar.entries) {
				for (const note of entry.notes) {
					if (selectedNoteIds.has(note.id)) {
						result.push({ note, entry, barIndex: bar.barIndex });
					}
				}
			}
		}
		return result;
	});

	let isExpanded = $derived(selectedInfos.length > 0);
	let isSingle = $derived(selectedInfos.length === 1);
	let singleNote = $derived(isSingle ? selectedInfos[0].note : null);
	let singleEntry = $derived(isSingle ? selectedInfos[0].entry : null);

	// ── Computed display values ──────────────────────────

	let noteNameDisplay = $derived.by(() => {
		if (isSingle && singleNote) return midiToNoteName(singleNote.midi);
		if (selectedInfos.length <= 4) {
			return selectedInfos.map(s => midiToNoteName(s.note.midi)).join(', ');
		}
		return selectedInfos.slice(0, 3).map(s => midiToNoteName(s.note.midi)).join(', ') + '...';
	});

	let midiDisplay = $derived(isSingle && singleNote ? `MIDI ${singleNote.midi}` : '');

	let chordDisplay = $derived.by(() => {
		if (isSingle && singleEntry) {
			return singleEntry.recognizedChordName ?? singleEntry.originalChordName ?? '-';
		}
		return '-';
	});

	let positionDisplay = $derived.by(() => {
		if (!isSingle || !singleNote) return '';
		const bar = Math.floor(singleNote.startTick / ticksPerBar) + 1;
		const tickInBar = singleNote.startTick % ticksPerBar;
		const beat = Math.floor(tickInBar / TICKS_PER_QUARTER) + 1;
		return `Bar ${bar}  Beat ${beat}`;
	});

	// Duration: common value or "Mixed"
	let commonDuration = $derived.by(() => {
		if (selectedInfos.length === 0) return null;
		const first = selectedInfos[0].note.durationTicks;
		const allSame = selectedInfos.every(s => s.note.durationTicks === first);
		return allSame ? first : null;
	});

	let durationPresetLabel = $derived.by(() => {
		if (commonDuration === null) return 'Mixed';
		const match = DURATION_PRESETS.find(p => p.ticks === commonDuration);
		return match ? match.label : `${commonDuration}`;
	});

	// Velocity: average for display
	let avgVelocity = $derived.by(() => {
		if (selectedInfos.length === 0) return 100;
		const sum = selectedInfos.reduce((s, i) => s + i.note.velocity, 0);
		return Math.round(sum / selectedInfos.length);
	});

	// ChordTone: common or indeterminate
	let chordToneState = $derived.by((): 'checked' | 'unchecked' | 'indeterminate' => {
		if (selectedInfos.length === 0) return 'unchecked';
		const first = selectedInfos[0].note.isChordTone;
		const allSame = selectedInfos.every(s => s.note.isChordTone === first);
		if (!allSame) return 'indeterminate';
		return first ? 'checked' : 'unchecked';
	});

	// ── Handlers ─────────────────────────────────────────

	function handleDurationChange(e: Event) {
		const ticks = parseInt((e.target as HTMLSelectElement).value);
		if (isNaN(ticks)) return;
		for (const info of selectedInfos) {
			onNoteUpdate(info.note.id, { durationTicks: ticks });
		}
	}

	function handleVelocityInput(e: Event) {
		const val = parseInt((e.target as HTMLInputElement).value);
		if (isNaN(val)) return;
		const clamped = Math.max(0, Math.min(127, val));
		for (const info of selectedInfos) {
			onNoteUpdate(info.note.id, { velocity: clamped });
		}
	}

	function handleChordToneToggle() {
		const newVal = chordToneState !== 'checked';
		for (const info of selectedInfos) {
			onNoteUpdate(info.note.id, { isChordTone: newVal });
		}
	}
</script>

<div class="note-info-panel" class:note-info-panel--expanded={isExpanded}>
	{#if !isExpanded}
		<div class="panel-empty">
			<span class="empty-label">ノートを選択</span>
		</div>
	{:else}
		<div class="panel-content">
			<!-- Header -->
			<div class="panel-header">
				{#if isSingle}
					Note Info
				{:else}
					{selectedInfos.length} notes
				{/if}
			</div>

			<!-- Note name -->
			<div class="info-row">
				<span class="info-icon">&#x266A;</span>
				<span class="info-value info-value--note">{noteNameDisplay}</span>
				{#if midiDisplay}
					<span class="info-sub">({midiDisplay})</span>
				{/if}
			</div>

			<!-- Chord -->
			{#if isSingle}
				<div class="info-row">
					<span class="info-label">Chord</span>
					<span class="info-value">{chordDisplay}</span>
				</div>
			{/if}

			<!-- Position -->
			{#if isSingle && positionDisplay}
				<div class="info-row">
					<span class="info-label">Position</span>
					<span class="info-value">{positionDisplay}</span>
				</div>
			{/if}

			<!-- Duration -->
			<div class="info-section">
				<span class="info-label">Duration</span>
				<div class="info-control">
					<select class="info-select" value={commonDuration ?? ''} onchange={handleDurationChange}>
						{#if commonDuration === null}
							<option value="" disabled selected>Mixed</option>
						{/if}
						{#each DURATION_PRESETS as preset}
							<option value={preset.ticks}>{preset.label}</option>
						{/each}
					</select>
					<span class="info-ticks">{commonDuration !== null ? `${commonDuration} tks` : ''}</span>
				</div>
			</div>

			<!-- Velocity -->
			<div class="info-section">
				<span class="info-label">Velocity</span>
				<div class="info-control">
					<input
						type="range"
						class="info-range"
						min="0"
						max="127"
						value={avgVelocity}
						oninput={handleVelocityInput}
					/>
					<input
						type="number"
						class="info-number"
						min="0"
						max="127"
						value={avgVelocity}
						onchange={handleVelocityInput}
					/>
				</div>
			</div>

			<!-- Chord Tone -->
			<div class="info-row info-row--toggle">
				<label class="info-checkbox-label">
					<input
						type="checkbox"
						class="info-checkbox"
						checked={chordToneState === 'checked'}
						indeterminate={chordToneState === 'indeterminate'}
						onchange={handleChordToneToggle}
					/>
					Chord Tone
				</label>
			</div>
		</div>
	{/if}
</div>

<style>
	.note-info-panel {
		width: 0;
		overflow: hidden;
		background: var(--bg-surface, #0d0d1a);
		border-left: 1px solid var(--border-subtle, #2a2a5a);
		transition: width 0.2s ease;
		flex-shrink: 0;
	}

	.note-info-panel--expanded {
		width: 180px;
	}

	.panel-empty {
		width: 180px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-label {
		font-size: 11px;
		color: var(--text-muted, #6060a0);
		writing-mode: vertical-rl;
		letter-spacing: 2px;
	}

	.panel-content {
		width: 180px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		overflow-y: auto;
		height: 100%;
		box-sizing: border-box;
	}

	.panel-header {
		font-size: 11px;
		font-weight: 700;
		color: var(--text-primary, #e0e0ff);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--border-subtle, #2a2a5a);
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}

	.info-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
	}

	.info-row--toggle {
		padding-top: 4px;
	}

	.info-icon {
		font-size: 14px;
		color: var(--accent-primary, #6366f1);
	}

	.info-label {
		font-size: 10px;
		font-weight: 600;
		color: var(--text-muted, #6060a0);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-value {
		font-size: 12px;
		font-family: 'JetBrains Mono', monospace;
		color: var(--text-primary, #e0e0ff);
	}

	.info-value--note {
		font-size: 14px;
		font-weight: 700;
	}

	.info-sub {
		font-size: 10px;
		color: var(--text-muted, #6060a0);
		font-family: 'JetBrains Mono', monospace;
	}

	.info-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-control {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.info-select {
		flex: 1;
		background: var(--bg-deepest, #06060f);
		border: 1px solid var(--border-subtle, #2a2a5a);
		border-radius: 4px;
		color: var(--text-primary, #e0e0ff);
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		padding: 3px 4px;
		cursor: pointer;
	}
	.info-select:focus {
		outline: none;
		border-color: var(--accent-primary, #6366f1);
	}

	.info-ticks {
		font-size: 10px;
		color: var(--text-muted, #6060a0);
		font-family: 'JetBrains Mono', monospace;
		white-space: nowrap;
	}

	.info-range {
		flex: 1;
		height: 4px;
		accent-color: var(--accent-primary, #6366f1);
		cursor: pointer;
	}

	.info-number {
		width: 40px;
		background: var(--bg-deepest, #06060f);
		border: 1px solid var(--border-subtle, #2a2a5a);
		border-radius: 4px;
		color: var(--text-primary, #e0e0ff);
		font-family: 'JetBrains Mono', monospace;
		font-size: 11px;
		padding: 2px 4px;
		text-align: center;
	}
	.info-number:focus {
		outline: none;
		border-color: var(--accent-primary, #6366f1);
	}
	/* Hide number input spinners */
	.info-number::-webkit-inner-spin-button,
	.info-number::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.info-checkbox-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--text-secondary, #9090b0);
		cursor: pointer;
	}

	.info-checkbox {
		accent-color: var(--accent-primary, #6366f1);
		cursor: pointer;
	}

	@media (max-width: 600px) {
		.note-info-panel {
			position: fixed;
			bottom: 72px;
			left: 0;
			right: 0;
			width: 100% !important;
			height: 0;
			max-height: 200px;
			border-left: none;
			border-top: 1px solid var(--border-default, #3a3a7a);
			border-radius: 12px 12px 0 0;
			z-index: 10;
			transition: height 0.25s ease, max-height 0.25s ease;
		}
		.note-info-panel--expanded {
			width: 100% !important;
			height: auto;
			max-height: 200px;
		}
		.panel-empty {
			display: none;
		}
		.panel-content {
			width: 100%;
			padding: 10px 16px;
			gap: 8px;
			flex-direction: row;
			flex-wrap: wrap;
			overflow-y: auto;
			height: auto;
			max-height: 190px;
		}
		.panel-header {
			width: 100%;
		}
		.info-section {
			flex: 1;
			min-width: 120px;
		}
		.info-row {
			min-width: 100px;
		}
	}
</style>
