<script lang="ts">
	import type { ChainNode } from '$lib/types/chain';
	import { descriptorForPlugin } from './plugin-descriptors';

	let {
		node,
		onParamChange,
		onClose
	}: {
		node: ChainNode;
		onParamChange: (paramId: string, value: number) => void;
		onClose: () => void;
	} = $props();

	let descriptor = $derived(descriptorForPlugin(node.plugin));

	function currentValue(paramId: string, fallback: number): number {
		const v = node.params[paramId];
		return typeof v === 'number' ? v : fallback;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function formatNumber(v: number): string {
		if (Math.abs(v) >= 100) return v.toFixed(0);
		if (Math.abs(v) >= 10) return v.toFixed(1);
		return v.toFixed(2);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="overlay"
	role="button"
	tabindex="-1"
	onclick={handleOverlayClick}
	onkeydown={() => {}}
>
	<div class="popover" role="dialog" aria-label="{node.plugin.name} パラメータ">
		<div class="head">
			<span class="name">{node.plugin.name}</span>
			<button class="close" onclick={onClose} aria-label="閉じる">×</button>
		</div>

		{#if descriptor}
			<div class="params">
				{#each descriptor.params as param (param.id)}
					<div class="param">
						<div class="param-label">
							<span>{param.label}</span>
							<span class="param-value">
								{#if param.kind === 'number'}
									{formatNumber(currentValue(param.id, param.default))}
									{#if param.unit}<span class="unit">{param.unit}</span>{/if}
								{/if}
							</span>
						</div>
						{#if param.kind === 'number'}
							<input
								type="range"
								min={param.min}
								max={param.max}
								step={param.step ?? 0.01}
								value={currentValue(param.id, param.default)}
								oninput={(e) =>
									onParamChange(param.id, Number((e.target as HTMLInputElement).value))}
								aria-label={param.label}
							/>
						{:else}
							<select
								value={currentValue(param.id, param.default)}
								onchange={(e) =>
									onParamChange(param.id, Number((e.target as HTMLSelectElement).value))}
								aria-label={param.label}
							>
								{#each param.options as opt (opt.value)}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div class="no-desc">
				このプラグインのパラメータ情報は利用できません ({node.plugin.format})
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-popover);
	}
	.popover {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-elevated);
		width: min(340px, 92vw);
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.name {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0 6px;
		line-height: 1;
	}
	.close:hover {
		color: var(--text-primary);
	}
	.params {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.param {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.param-label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.72rem;
		color: var(--text-secondary);
	}
	.param-value {
		font-family: var(--font-mono);
		color: var(--text-primary);
	}
	.unit {
		color: var(--text-muted);
		font-size: 0.65rem;
		margin-left: 2px;
	}
	.param input[type='range'] {
		width: 100%;
		height: 4px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--bg-elevated);
		border-radius: 2px;
		outline: none;
		padding: 0;
		border: none;
	}
	.param input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}
	.param input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent-primary);
		cursor: pointer;
		border: none;
	}
	.param select {
		padding: 4px 8px;
		font-size: 0.78rem;
		background: var(--bg-base);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
	}
	.no-desc {
		padding: var(--space-sm);
		color: var(--text-muted);
		font-size: 0.75rem;
		text-align: center;
	}
</style>
