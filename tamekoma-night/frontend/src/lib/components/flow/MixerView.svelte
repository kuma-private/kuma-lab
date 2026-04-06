<script lang="ts">
	interface TrackInfo {
		id: string;
		name: string;
		instrument: string;
		volume: number;
		mute: boolean;
		solo: boolean;
	}

	interface Props {
		tracks: TrackInfo[];
		onTrackVolume?: (trackId: string, db: number) => void;
		onTrackMute?: (trackId: string, mute: boolean) => void;
		onTrackSolo?: (trackId: string, solo: boolean) => void;
	}

	let {
		tracks,
		onTrackVolume,
		onTrackMute,
		onTrackSolo,
	}: Props = $props();

	const TRACK_COLORS: Record<string, string> = {
		piano: '#a898c8',
		bass: '#88b090',
		drums: '#c8a060',
		strings: '#80a0b8',
		guitar: '#c0a860',
		organ: '#c08878',
	};

	const DEFAULT_COLOR = '#908888';

	function getColor(instrument: string): string {
		return TRACK_COLORS[instrument.toLowerCase()] ?? DEFAULT_COLOR;
	}

	function formatDb(db: number): string {
		if (db <= -60) return '-inf';
		return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
	}
</script>

<div class="mixer-view">
	<div class="channel-strips">
		{#each tracks as track (track.id)}
			<div class="channel-strip">
				<!-- Color indicator -->
				<div class="color-indicator" style="background: {getColor(track.instrument)};"></div>

				<!-- dB display -->
				<div class="db-display">{formatDb(track.volume)}</div>

				<!-- Vertical fader -->
				<div class="fader-container">
					<input
						type="range"
						class="fader"
						min="-60"
						max="6"
						step="0.5"
						value={track.volume}
						oninput={(e) => {
							const val = parseFloat((e.target as HTMLInputElement).value);
							onTrackVolume?.(track.id, val);
						}}
						aria-label="{track.name} 音量"
					/>
				</div>

				<!-- Mute / Solo buttons -->
				<div class="btn-row">
					<button
						class="ms-btn"
						class:active={track.mute}
						onclick={() => onTrackMute?.(track.id, !track.mute)}
						title="Mute"
						aria-label="{track.name} ミュート"
						aria-pressed={track.mute}
					>M</button>
					<button
						class="ms-btn solo"
						class:active={track.solo}
						onclick={() => onTrackSolo?.(track.id, !track.solo)}
						title="Solo"
						aria-label="{track.name} ソロ"
						aria-pressed={track.solo}
					>S</button>
				</div>

				<!-- Track name -->
				<div class="track-name" style="color: {getColor(track.instrument)};">
					{track.name}
				</div>
			</div>
		{/each}
	</div>

	{#if tracks.length === 0}
		<div class="empty-state">
			<span>トラックがありません</span>
		</div>
	{/if}
</div>

<style>
	.mixer-view {
		display: flex;
		flex: 1;
		align-items: stretch;
		justify-content: center;
		padding: var(--space-md);
		overflow-x: auto;
		background: var(--bg-surface);
	}

	.channel-strips {
		display: flex;
		gap: var(--space-sm);
		align-items: stretch;
	}

	.channel-strip {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 80px;
		padding: var(--space-sm);
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		gap: var(--space-xs);
	}

	.color-indicator {
		width: 100%;
		height: 4px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.db-display {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-muted);
		text-align: center;
		flex-shrink: 0;
		min-height: 16px;
	}

	.fader-container {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 160px;
	}

	.fader {
		writing-mode: vertical-lr;
		direction: rtl;
		height: 160px;
		width: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--border-subtle);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}

	.fader::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 10px;
		border-radius: 3px;
		background: var(--text-muted);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
		transition: background 0.15s;
	}

	.fader::-moz-range-thumb {
		width: 20px;
		height: 10px;
		border-radius: 3px;
		background: var(--text-muted);
		border: 1px solid var(--border-subtle);
		cursor: pointer;
	}

	.fader:hover::-webkit-slider-thumb {
		background: var(--accent-warm);
	}

	.fader:hover::-moz-range-thumb {
		background: var(--accent-warm);
	}

	.btn-row {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.ms-btn {
		width: 28px;
		height: 24px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}

	.ms-btn:hover {
		border-color: var(--border-default);
		color: var(--text-primary);
	}

	.ms-btn.active {
		background: var(--error);
		color: #fff;
		border-color: var(--error);
	}

	.ms-btn.solo.active {
		background: var(--accent-warm);
		color: #000;
		border-color: var(--accent-warm);
	}

	.track-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 100%;
		flex-shrink: 0;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--text-muted);
		font-size: 0.85rem;
	}
</style>
