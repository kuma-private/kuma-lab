<script lang="ts">
	import type { EhonPage, EhonMode } from '$lib/types';
	import EhonElement from './EhonElement.svelte';
	import EhonText from './EhonText.svelte';

	let { page, mode }: { page: EhonPage; mode: EhonMode } = $props();

	let sortedElements = $derived(
		[...page.elements].sort((a, b) => a.zIndex - b.zIndex)
	);
</script>

<div class="ehon-page" data-mode={mode}>
	<div class="stage">
		<div class="paper">
			{#each sortedElements as el, i (i)}
				<EhonElement element={el} {mode} />
			{/each}
		</div>

		<div class="text-plaque">
			<EhonText text={page.text} {mode} />
		</div>

		<div class="paper-grain" aria-hidden="true"></div>
	</div>
</div>

<style>
	.ehon-page {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.stage {
		position: relative;
		width: 100%;
		height: 100%;
		background:
			radial-gradient(ellipse at 30% 20%, rgba(255, 246, 220, 0.9), transparent 60%),
			radial-gradient(ellipse at 80% 85%, rgba(243, 222, 180, 0.8), transparent 65%),
			linear-gradient(180deg, #fcf5e8 0%, #f5e7c6 100%);
		overflow: hidden;
		isolation: isolate;
	}

	.paper {
		position: absolute;
		inset: 0;
	}

	.paper-grain {
		pointer-events: none;
		position: absolute;
		inset: 0;
		background-image:
			repeating-linear-gradient(
				0deg,
				rgba(120, 72, 24, 0.04) 0px,
				rgba(120, 72, 24, 0.04) 1px,
				transparent 1px,
				transparent 3px
			),
			repeating-linear-gradient(
				90deg,
				rgba(120, 72, 24, 0.03) 0px,
				rgba(120, 72, 24, 0.03) 1px,
				transparent 1px,
				transparent 4px
			);
		mix-blend-mode: multiply;
		opacity: 0.6;
	}

	.text-plaque {
		position: absolute;
		left: 4%;
		right: 4%;
		bottom: 4%;
		min-height: 22%;
		max-height: 30%;
		padding: 14px 20px;
		background: linear-gradient(
			180deg,
			rgba(255, 252, 238, 1) 0%,
			rgba(248, 236, 206, 1) 100%
		);
		border: 1.5px solid rgba(107, 62, 31, 0.35);
		box-shadow:
			inset 0 0 0 3px rgba(255, 255, 255, 0.6),
			0 -2px 12px rgba(70, 38, 10, 0.18);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		container-type: size;
		container-name: plaque;
		z-index: 999;
	}

	.ehon-page[data-mode='cosmos'] .stage::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background:
			repeating-linear-gradient(
				45deg,
				rgba(139, 90, 40, 0.06) 0 2px,
				transparent 2px 5px
			),
			radial-gradient(ellipse at 50% 50%, rgba(139, 90, 40, 0.05), transparent 70%);
		mix-blend-mode: multiply;
		z-index: 5;
	}

	.ehon-page[data-mode='chaos'] .stage {
		background:
			radial-gradient(ellipse at 20% 30%, rgba(255, 240, 200, 0.85), transparent 60%),
			radial-gradient(ellipse at 85% 80%, rgba(240, 215, 170, 0.85), transparent 65%),
			linear-gradient(180deg, #f7e8c4 0%, #e8cf96 100%);
	}

	.ehon-page[data-mode='chaos'] .text-plaque {
		background: linear-gradient(
			180deg,
			rgba(255, 248, 220, 1) 0%,
			rgba(244, 220, 170, 1) 100%
		);
		border-color: rgba(90, 50, 20, 0.45);
	}
</style>
