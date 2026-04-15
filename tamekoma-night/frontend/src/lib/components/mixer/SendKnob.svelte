<script lang="ts">
	let {
		value,
		label = '',
		min = 0,
		max = 1,
		onChange,
		onRemove
	}: {
		value: number;
		label?: string;
		min?: number;
		max?: number;
		onChange: (v: number) => void;
		onRemove?: () => void;
	} = $props();

	// Rotary drag state
	let dragging = $state(false);
	let startY = 0;
	let startValue = 0;

	function handlePointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		dragging = true;
		startY = e.clientY;
		startValue = value;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const dy = startY - e.clientY;
		const range = max - min;
		// 100 px drag = full range
		const next = Math.max(min, Math.min(max, startValue + (dy / 100) * range));
		onChange(next);
	}

	function handlePointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.target as HTMLElement).releasePointerCapture(e.pointerId);
	}

	function handleDblClick() {
		// Reset to the floor of the configured range rather than a hardcoded
		// 0 — clamps correctly when `min` is non-zero (e.g. a send that
		// shouldn't be allowed to fully mute).
		onChange(min);
	}

	// Rotate 0..1 value to -135..+135 degrees
	let angle = $derived.by(() => {
		const norm = (value - min) / (max - min);
		return -135 + norm * 270;
	});
</script>

<div class="send-knob">
	<button
		class="knob"
		type="button"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerUp}
		ondblclick={handleDblClick}
		title="{label}: {value.toFixed(2)} (ダブルクリックでリセット)"
		aria-label="{label} 送り量"
	>
		<span class="indicator" style="transform: rotate({angle}deg)"></span>
	</button>
	<span class="label" title={label}>{label}</span>
	{#if onRemove}
		<button class="remove" type="button" onclick={onRemove} aria-label="送りを削除">×</button>
	{/if}
</div>

<style>
	.send-knob {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.66rem;
		color: var(--text-muted);
	}
	.knob {
		position: relative;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: radial-gradient(circle at 30% 30%, #3a2e1a, #1a1408);
		border: 1px solid var(--border-default);
		cursor: ns-resize;
		padding: 0;
		flex-shrink: 0;
	}
	.knob:hover {
		border-color: var(--accent-primary);
	}
	.indicator {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 2px;
		height: 8px;
		background: var(--accent-primary);
		transform-origin: center bottom;
		transform: translate(-50%, -100%) rotate(0deg);
		pointer-events: none;
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
	}
	.remove {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0 2px;
		line-height: 1;
	}
	.remove:hover {
		color: var(--error);
	}
</style>
