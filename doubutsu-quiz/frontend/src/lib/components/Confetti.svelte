<script lang="ts">
	import { onMount } from 'svelte';

	let particles: { id: number; x: number; color: string; delay: number; size: number; round: boolean }[] = $state([]);

	const colors = ['#FF9F43', '#26A69A', '#FF6B6B', '#FECA57', '#48DBFB'];

	onMount(() => {
		particles = Array.from({ length: 15 }, (_, i) => ({
			id: i,
			x: Math.random() * 100,
			color: colors[i % colors.length],
			delay: Math.random() * 0.6,
			size: 6 + Math.random() * 8,
			round: i % 2 === 0
		}));

		const timer = setTimeout(() => {
			particles = [];
		}, 2500);

		return () => clearTimeout(timer);
	});
</script>

<div class="confetti-container">
	{#each particles as p (p.id)}
		<div
			class="particle"
			style="left:{p.x}%;background:{p.color};width:{p.size}px;height:{p.size}px;animation-delay:{p.delay}s;border-radius:{p.round ? '50%' : '3px'}"
		></div>
	{/each}
</div>

<style>
	.confetti-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 1000;
		overflow: hidden;
	}

	.particle {
		position: absolute;
		top: -20px;
		animation: confettiFall 2s ease-in forwards;
	}
</style>
