<script lang="ts">
	import type { AutomationPoint, AutomationCurve } from '$lib/types/chain';
	import { songStore } from '$lib/stores/song.svelte';
	import AiCurveButton from './AiCurveButton.svelte';

	let {
		trackId,
		nodeId,
		paramId,
		label,
		points,
		totalBars,
		ticksPerBar,
		barsPerBeat = 4,
		bpm = 120,
		previewPoints = null,
		previewRange = null,
		onRequestPreview,
		onApplyPreview,
		onCancelPreview,
		onRemoveLane
	}: {
		trackId: string;
		nodeId: string;
		paramId: string;
		label: string;
		points: AutomationPoint[];
		totalBars: number;
		ticksPerBar: number;
		barsPerBeat?: number;
		bpm?: number;
		previewPoints?: AutomationPoint[] | null;
		previewRange?: { startTick: number; endTick: number } | null;
		onRequestPreview?: (req: {
			prompt: string;
			startTick: number;
			endTick: number;
		}) => Promise<void>;
		onApplyPreview?: () => void;
		onCancelPreview?: () => void;
		onRemoveLane?: () => void;
	} = $props();

	const PX_PER_BAR = 80;
	const LANE_HEIGHT = 100;
	const POINT_RADIUS = 5;

	let svgEl = $state<SVGSVGElement | null>(null);
	let draggingId = $state<string | null>(null);
	let menuOpen = $state(false);

	let totalWidth = $derived(PX_PER_BAR * Math.max(totalBars, 1));
	let totalTicks = $derived(ticksPerBar * Math.max(totalBars, 1));
	let pxPerTick = $derived(PX_PER_BAR / ticksPerBar);

	let sortedPoints = $derived([...points].sort((a, b) => a.tick - b.tick));

	function tickToX(tick: number): number {
		return tick * pxPerTick;
	}

	function xToTick(x: number): number {
		const clamped = Math.max(0, Math.min(x, totalWidth));
		return Math.round(clamped / pxPerTick);
	}

	function valueToY(value: number): number {
		return (1 - Math.max(0, Math.min(1, value))) * LANE_HEIGHT;
	}

	function yToValue(y: number): number {
		const clamped = Math.max(0, Math.min(y, LANE_HEIGHT));
		return 1 - clamped / LANE_HEIGHT;
	}

	function pathFor(pts: AutomationPoint[]): string {
		if (pts.length === 0) return '';
		let d = '';
		for (let i = 0; i < pts.length; i++) {
			const p = pts[i];
			const x = tickToX(p.tick);
			const y = valueToY(p.value);
			if (i === 0) {
				d += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
				continue;
			}
			const prev = pts[i - 1];
			const prevCurve = prev.curve ?? 'linear';
			const prevX = tickToX(prev.tick);
			const prevY = valueToY(prev.value);
			if (prevCurve === 'hold') {
				// Horizontal then vertical step: go horizontal to x at prevY, then vertical to y.
				d += ` L ${x.toFixed(1)} ${prevY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
			} else if (prevCurve === 'bezier') {
				const midX = (prevX + x) / 2;
				d += ` Q ${midX.toFixed(1)} ${prevY.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
			} else {
				d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
			}
		}
		return d;
	}

	let pathD = $derived(pathFor(sortedPoints));
	let previewPathD = $derived(previewPoints ? pathFor([...previewPoints].sort((a, b) => a.tick - b.tick)) : '');

	function svgCoords(e: MouseEvent): { x: number; y: number } {
		if (!svgEl) return { x: 0, y: 0 };
		const rect = svgEl.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function handleBackgroundClick(e: MouseEvent) {
		if (draggingId) return;
		const target = e.target as SVGElement;
		if (target && target.classList.contains('point')) return;
		const { x, y } = svgCoords(e);
		const tick = xToTick(x);
		const value = yToValue(y);
		songStore.addAutomationPoint(trackId, nodeId, paramId, tick, value, 'linear');
	}

	function handleBackgroundKeydown(_e: KeyboardEvent) {
		// Keyboard handler is required alongside click for accessibility linter,
		// but we do not add points via keyboard here.
	}

	function handlePointMouseDown(e: MouseEvent, pointId: string) {
		if (e.button !== 0) return;
		e.stopPropagation();
		draggingId = pointId;
		const onMove = (ev: MouseEvent) => {
			if (!draggingId) return;
			const { x, y } = svgCoords(ev);
			const tick = xToTick(x);
			const value = yToValue(y);
			songStore.moveAutomationPoint(trackId, nodeId, paramId, draggingId, tick, value);
		};
		const onUp = () => {
			draggingId = null;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	function handlePointContextMenu(e: MouseEvent, pointId: string) {
		e.preventDefault();
		e.stopPropagation();
		songStore.removeAutomationPoint(trackId, nodeId, paramId, pointId);
	}

	function handlePointDoubleClick(e: MouseEvent, pointId: string) {
		e.stopPropagation();
		const current = sortedPoints.find((p) => p.id === pointId);
		if (!current) return;
		const cur = current.curve ?? 'linear';
		const next: AutomationCurve = cur === 'linear' ? 'hold' : cur === 'hold' ? 'bezier' : 'linear';
		songStore.setAutomationPointCurve(trackId, nodeId, paramId, pointId, next);
	}

	// Bar grid lines
	let barLines = $derived(
		Array.from({ length: Math.max(totalBars + 1, 1) }, (_, i) => i * PX_PER_BAR)
	);
	let valueLines = $derived([0, 0.25, 0.5, 0.75, 1].map((v) => valueToY(v)));
</script>

<div class="lane-wrapper">
	<div class="lane-header">
		<div class="lane-title">{label}</div>
		<div class="lane-actions">
			{#if onRequestPreview && onApplyPreview && onCancelPreview}
				<AiCurveButton
					defaultFromBar={1}
					defaultToBar={Math.max(totalBars, 1)}
					ticksPerBar={ticksPerBar}
					hasPreview={!!previewPoints}
					{onRequestPreview}
					onApply={onApplyPreview}
					onCancel={onCancelPreview}
				/>
			{/if}
			<div class="menu-wrap">
				<button
					type="button"
					class="menu-btn"
					onclick={() => (menuOpen = !menuOpen)}
					aria-label="レーンメニュー"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
				>
					&hellip;
				</button>
				{#if menuOpen}
					<div class="menu" role="menu">
						<button
							type="button"
							role="menuitem"
							class="menu-item danger"
							onclick={() => {
								menuOpen = false;
								onRemoveLane?.();
							}}
						>
							Remove Lane
						</button>
					</div>
				{/if}
			</div>
			<button
				type="button"
				class="remove-btn"
				onclick={() => onRemoveLane?.()}
				aria-label="レーンを削除"
				title="Remove lane"
			>
				×
			</button>
		</div>
	</div>
	<div class="lane-scroll">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<svg
			bind:this={svgEl}
			class="lane-svg"
			width={totalWidth}
			height={LANE_HEIGHT}
			role="application"
			aria-label="{label} オートメーション"
			onclick={handleBackgroundClick}
			onkeydown={handleBackgroundKeydown}
			tabindex="0"
		>
			<!-- Background grid -->
			<g class="grid">
				{#each valueLines as y, i (i)}
					<line
						x1="0"
						y1={y}
						x2={totalWidth}
						y2={y}
						class="value-line"
						class:value-line--mid={i === 2}
					/>
				{/each}
				{#each barLines as x, i (i)}
					<line x1={x} y1="0" x2={x} y2={LANE_HEIGHT} class="bar-line" />
				{/each}
			</g>

			<!-- Preview (dashed) -->
			{#if previewPoints && previewPoints.length > 0}
				<path class="preview-path" d={previewPathD} />
				{#each previewPoints as pp, i (i)}
					<circle
						cx={tickToX(pp.tick)}
						cy={valueToY(pp.value)}
						r={POINT_RADIUS - 1}
						class="preview-point"
					/>
				{/each}
				{#if previewRange}
					<rect
						x={tickToX(previewRange.startTick)}
						y="0"
						width={tickToX(previewRange.endTick) - tickToX(previewRange.startTick)}
						height={LANE_HEIGHT}
						class="preview-range"
					/>
				{/if}
			{/if}

			<!-- Current polyline -->
			{#if sortedPoints.length > 0}
				<path class="lane-path" d={pathD} />
			{/if}

			<!-- Points -->
			{#each sortedPoints as p (p.id)}
				<circle
					class="point"
					class:point--active={draggingId === p.id}
					cx={tickToX(p.tick)}
					cy={valueToY(p.value)}
					r={POINT_RADIUS}
					data-point-id={p.id}
					onmousedown={(e) => handlePointMouseDown(e, p.id)}
					oncontextmenu={(e) => handlePointContextMenu(e, p.id)}
					ondblclick={(e) => handlePointDoubleClick(e, p.id)}
					role="button"
					tabindex="-1"
					aria-label="ポイント"
				/>
			{/each}
		</svg>
		<!-- Bar numbers strip -->
		<div class="bar-ruler" style="width: {totalWidth}px;">
			{#each Array.from({ length: Math.max(totalBars, 1) }, (_, i) => i + 1) as barNum (barNum)}
				<div class="bar-tick" style="width: {PX_PER_BAR}px;">bar{barNum}</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.lane-wrapper {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--space-sm);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}
	.lane-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}
	.lane-title {
		font-family: var(--font-sans);
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lane-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.menu-wrap {
		position: relative;
	}
	.menu-btn {
		width: 22px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.85rem;
		line-height: 1;
	}
	.menu-btn:hover {
		color: var(--text-primary);
		border-color: var(--border-default);
	}
	.menu {
		position: absolute;
		top: calc(100% + 2px);
		right: 0;
		min-width: 140px;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-elevated);
		z-index: var(--z-context-menu);
		padding: 2px;
		display: flex;
		flex-direction: column;
	}
	.menu-item {
		padding: 5px 10px;
		font-size: 0.7rem;
		background: none;
		border: none;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
		border-radius: 2px;
	}
	.menu-item:hover {
		background: var(--bg-hover);
	}
	.menu-item.danger {
		color: var(--error);
	}
	.remove-btn {
		width: 22px;
		height: 22px;
		padding: 0;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.95rem;
		line-height: 1;
	}
	.remove-btn:hover {
		color: var(--error);
		border-color: var(--error);
	}
	.lane-scroll {
		overflow-x: auto;
		overflow-y: hidden;
	}
	.lane-svg {
		display: block;
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		cursor: crosshair;
	}
	.lane-svg:focus-visible {
		outline: 1px solid var(--accent-primary);
		outline-offset: 1px;
	}
	.bar-line {
		stroke: var(--border-subtle);
		stroke-width: 1;
		opacity: 0.5;
	}
	.value-line {
		stroke: var(--border-subtle);
		stroke-width: 1;
		stroke-dasharray: 2 4;
		opacity: 0.4;
	}
	.value-line--mid {
		opacity: 0.7;
	}
	.lane-path {
		fill: none;
		stroke: var(--accent-primary);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.preview-path {
		fill: none;
		stroke: var(--accent-warm);
		stroke-width: 2;
		stroke-dasharray: 4 3;
		opacity: 0.9;
	}
	.preview-point {
		fill: var(--accent-warm);
		stroke: none;
		opacity: 0.9;
		pointer-events: none;
	}
	.preview-range {
		fill: rgba(232, 168, 76, 0.08);
		stroke: none;
		pointer-events: none;
	}
	.point {
		fill: var(--accent-primary);
		stroke: #fff;
		stroke-width: 1.2;
		cursor: grab;
	}
	.point:hover {
		fill: var(--accent-warm);
		r: 6;
	}
	.point--active {
		cursor: grabbing;
		fill: var(--accent-warm);
	}
	.bar-ruler {
		display: flex;
		margin-top: 2px;
		font-family: var(--font-mono);
		font-size: 0.55rem;
		color: var(--text-muted);
	}
	.bar-tick {
		text-align: left;
		padding-left: 2px;
		box-sizing: border-box;
	}
</style>