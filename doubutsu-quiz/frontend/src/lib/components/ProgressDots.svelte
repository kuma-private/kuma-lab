<script lang="ts">
	let { total, current }: { total: number; current: number } = $props();
</script>

<div class="dots">
	{#each Array(total) as _, i}
		<div
			class="dot"
			class:completed={i < current}
			class:active={i === current}
			style="transition-delay: {i * 30}ms"
		>
			{#if i < current}
				<span class="check">&#x2714;</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.dots {
		display: flex;
		gap: 6px;
		justify-content: center;
		padding: 8px 0;
	}

	.dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--primary-light);
		opacity: 0.3;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 8px;
	}

	.dot.completed {
		background: var(--primary);
		opacity: 0.7;
		width: 14px;
		height: 14px;
	}

	.check {
		color: white;
		font-size: 8px;
		line-height: 1;
	}

	.dot.active {
		background: var(--primary);
		opacity: 1;
		animation: pulse 1.5s ease-in-out infinite;
		transform: scale(1.4);
		box-shadow: 0 0 8px var(--primary-light);
	}
</style>
