<script lang="ts">
	interface Scores {
		tension: number;
		creativity: number;
		coherence: number;
		surprise: number;
	}

	interface Props {
		comment: string;
		scores: Scores | null;
	}

	let { comment, scores }: Props = $props();

	const labels: { key: keyof Scores; label: string }[] = [
		{ key: 'tension', label: 'テンション' },
		{ key: 'creativity', label: '創造性' },
		{ key: 'coherence', label: '整合性' },
		{ key: 'surprise', label: 'サプライズ' },
	];

	// Radar chart SVG helpers
	const cx = 60;
	const cy = 60;
	const maxR = 45;
	const axes = 4;

	const angleFor = (i: number): number => (Math.PI * 2 * i) / axes - Math.PI / 2;

	const pointOnAxis = (i: number, value: number): { x: number; y: number } => {
		const a = angleFor(i);
		const r = (value / 5) * maxR;
		return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
	};

	const radarPoints = $derived.by(() => {
		if (!scores) return '';
		const vals = [scores.tension, scores.creativity, scores.coherence, scores.surprise];
		return vals.map((v, i) => {
			const p = pointOnAxis(i, v);
			return `${p.x},${p.y}`;
		}).join(' ');
	});

	const gridPolygon = (level: number): string => {
		return Array.from({ length: axes }, (_, i) => {
			const p = pointOnAxis(i, level);
			return `${p.x},${p.y}`;
		}).join(' ');
	};

	const renderStars = (value: number): string => {
		const filled = Math.round(Math.max(0, Math.min(5, value)));
		return '\u2605'.repeat(filled) + '\u2606'.repeat(5 - filled);
	};
</script>

<div class="ai-review">
	<div class="ai-review-header">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M12 2L2 7l10 5 10-5-10-5z" />
			<path d="M2 17l10 5 10-5" />
			<path d="M2 12l10 5 10-5" />
		</svg>
		<span>AI Review</span>
	</div>

	<div class="ai-review-body">
		{#if scores}
			<div class="ai-review-chart">
				<svg viewBox="0 0 120 120" width="120" height="120">
					<!-- Grid rings -->
					{#each [1, 2, 3, 4, 5] as level}
						<polygon
							points={gridPolygon(level)}
							fill="none"
							stroke="var(--border-subtle)"
							stroke-width="0.5"
							opacity={level === 5 ? 0.6 : 0.3}
						/>
					{/each}
					<!-- Axes -->
					{#each Array.from({ length: axes }) as _, i}
						{@const p = pointOnAxis(i, 5)}
						<line x1={cx} y1={cy} x2={p.x} y2={p.y}
							stroke="var(--border-subtle)" stroke-width="0.5" opacity="0.4" />
					{/each}
					<!-- Data polygon -->
					<polygon
						points={radarPoints}
						fill="rgba(232, 168, 76, 0.2)"
						stroke="var(--accent-primary)"
						stroke-width="1.5"
					/>
					<!-- Data points -->
					{#each [scores.tension, scores.creativity, scores.coherence, scores.surprise] as v, i}
						{@const p = pointOnAxis(i, v)}
						<circle cx={p.x} cy={p.y} r="2.5" fill="var(--accent-primary)" />
					{/each}
					<!-- Axis labels -->
					{#each labels as item, i}
						{@const p = pointOnAxis(i, 6.2)}
						<text x={p.x} y={p.y} text-anchor="middle" dominant-baseline="middle"
							fill="var(--text-muted)" font-size="6" font-family="var(--font-sans)">
							{item.label}
						</text>
					{/each}
				</svg>
			</div>
		{/if}

		<div class="ai-review-content">
			{#if comment}
				<p class="ai-review-comment">{comment}</p>
			{:else}
				<p class="ai-review-empty">レビューなし</p>
			{/if}
		</div>
	</div>

	{#if scores}
		<div class="ai-review-scores">
			{#each labels as item}
				<div class="ai-score-item">
					<span class="ai-score-label">{item.label}</span>
					<span class="ai-score-stars">{renderStars(scores[item.key])}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ai-review {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.ai-review-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-sm) var(--space-md);
		background: rgba(96, 165, 250, 0.08);
		border-bottom: 1px solid var(--border-subtle);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.ai-review-body {
		display: flex;
		align-items: flex-start;
		gap: var(--space-md);
		padding: var(--space-md);
	}

	.ai-review-chart {
		flex-shrink: 0;
	}

	.ai-review-content {
		flex: 1;
		min-width: 0;
	}

	.ai-review-comment {
		font-size: 0.82rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.ai-review-empty {
		font-size: 0.82rem;
		color: var(--text-muted);
		font-style: italic;
		margin: 0;
	}

	.ai-review-scores {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px var(--space-md);
		padding: var(--space-sm) var(--space-md);
		border-top: 1px solid var(--border-subtle);
		background: rgba(0, 0, 0, 0.1);
	}

	.ai-score-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.ai-score-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		min-width: 65px;
	}

	.ai-score-stars {
		font-size: 0.72rem;
		color: var(--accent-warm);
		letter-spacing: 1px;
	}
</style>
