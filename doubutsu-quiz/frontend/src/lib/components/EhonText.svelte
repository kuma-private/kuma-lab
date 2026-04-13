<script lang="ts">
	import type { EhonMode } from '$lib/types';

	type Variant = 'body' | 'title';

	let {
		text,
		mode = 'cosmos',
		variant = 'body'
	}: { text: string; mode?: EhonMode; variant?: Variant } = $props();

	let chars = $derived([...text]);

	// タイトルは 1 文字ずつ stagger、本文は wipe-in で読みやすさ優先。
	function titleDelay(i: number): string {
		return `${i * 45}ms`;
	}
</script>

{#if variant === 'title'}
	<p class="ehon-text title" data-mode={mode}>
		{#key text}
			{#each chars as ch, i (i)}
				{#if ch === '\n'}
					<br />
				{:else if ch === ' ' || ch === '\u3000'}
					<span class="space" aria-hidden="true">&nbsp;</span>
				{:else}
					<span class="letter" style="animation-delay: {titleDelay(i)}">{ch}</span>
				{/if}
			{/each}
		{/key}
	</p>
{:else}
	<p class="ehon-text body" data-mode={mode}>
		{#key text}
			<span class="wipe">{text}</span>
		{/key}
	</p>
{/if}

<style>
	.ehon-text {
		font-family:
			'Klee One', 'Hiragino Mincho ProN', 'Hiragino Mincho Pro', 'Yu Mincho',
			'Yu Mincho Medium', 'YuMincho', 'HGS明朝E', serif;
		line-height: 1.7;
		letter-spacing: 0.06em;
		text-align: center;
		word-break: keep-all;
		overflow-wrap: anywhere;
		margin: 0;
		max-height: 100%;
		overflow: hidden;
	}

	/* --- body (本文): 可読性優先。単色 + wipe-in --- */
	.ehon-text.body {
		font-weight: 600;
		font-size: clamp(0.95rem, 4.2cqw, 1.55rem);
		color: #2b2015;
	}

	.ehon-text.body .wipe {
		display: inline-block;
		background-clip: padding-box;
		clip-path: inset(0 100% 0 0);
		animation: wipeIn 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	@keyframes wipeIn {
		0% {
			clip-path: inset(0 100% 0 0);
		}
		100% {
			clip-path: inset(0 0 0 0);
		}
	}

	/* --- title: 1 文字ずつのグラデーション stagger --- */
	.ehon-text.title {
		font-weight: 700;
		font-size: clamp(1.4rem, 3vw, 2.4rem);
	}

	.ehon-text.title .letter {
		display: inline-block;
		opacity: 0;
		transform: translateY(10px);
		background-image: linear-gradient(180deg, #1f2933 0%, #3d2b1f 50%, #6b3e1f 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		animation: letterReveal 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	.ehon-text.title[data-mode='chaos'] .letter {
		background-image: linear-gradient(135deg, #ff5e7a 0%, #8a2be2 45%, #1c1a3a 100%);
		-webkit-background-clip: text;
		background-clip: text;
		animation-name: letterRevealChaos;
	}

	.space {
		display: inline-block;
		width: 0.4em;
	}

	@keyframes letterReveal {
		0% {
			opacity: 0;
			transform: translateY(12px) scale(0.94);
			filter: blur(4px);
		}
		60% {
			opacity: 1;
			transform: translateY(-2px) scale(1.02);
			filter: blur(0);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
			filter: blur(0);
		}
	}

	@keyframes letterRevealChaos {
		0% {
			opacity: 0;
			transform: translateY(14px) rotate(-4deg) scale(0.9);
			filter: blur(6px);
		}
		50% {
			opacity: 1;
			transform: translateY(-3px) rotate(2deg) scale(1.05);
			filter: blur(0);
		}
		100% {
			opacity: 1;
			transform: translateY(0) rotate(0deg) scale(1);
			filter: blur(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ehon-text.body .wipe {
			animation: none;
			clip-path: inset(0 0 0 0);
		}
		.ehon-text.title .letter {
			animation: none;
			opacity: 1;
			transform: none;
			filter: none;
		}
	}
</style>
