<script lang="ts">
	import { onMount } from 'svelte';

	let particles: { id: number; x: number; color: string; delay: number; size: number }[] = $state([]);

	const colors = ['#FF9F43', '#26A69A', '#FF6B6B', '#A29BFE', '#FECA57', '#48DBFB', '#FF9FF3'];

	onMount(() => {
		particles = Array.from({ length: 30 }, (_, i) => ({
			id: i,
			x: Math.random() * 100,
			color: colors[Math.floor(Math.random() * colors.length)],
			delay: Math.random() * 0.8,
			size: 6 + Math.random() * 10
		}));

		const timer = setTimeout(() => {
			particles = [];
		}, 3000);

		return () => clearTimeout(timer);
	});
</script>

<div class="confetti-container">
	{#each particles as p (p.id)}
		<div
			class="particle"
			style="
				left: {p.x}%;
				background: {p.color};
				width: {p.size}px;
				height: {p.size}px;
				animation-delay: {p.delay}s;
				border-radius: {Math.random() > 0.5 ? '50%' : '3px'};
			"
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
		animation: confettiFall 2.5s ease-in forwards;
	}
</style>
