<script lang="ts">
	import type { EhonElement, EhonMode } from '$lib/types';
	import { loadImage } from '$lib/imageLoader';

	let { element, mode }: { element: EhonElement; mode: EhonMode } = $props();

	// Throttled load: defer setting <img src> until the loader queue allows it.
	// Prevents overwhelming blogger.googleusercontent.com when a page has 5+ elements.
	let resolvedSrc = $state<string | null>(null);
	let loadFailed = $state(false);
	$effect(() => {
		const url = element.image.imageUrl;
		let cancelled = false;
		resolvedSrc = null;
		loadFailed = false;
		loadImage(url)
			.then((src) => {
				if (!cancelled) resolvedSrc = src;
			})
			.catch(() => {
				if (!cancelled) loadFailed = true;
			});
		return () => {
			cancelled = true;
		};
	});

	// Deterministic pseudo-random jitter in [-3, +3] degrees derived from imageId.
	// Cosmos mode only: Claude tends to align elements neatly, so we add
	// a per-element rotation offset to reintroduce a hand-placed feel.
	function hashString(s: string): number {
		let h = 2166136261;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return h >>> 0;
	}

	let jitterDeg = $derived.by(() => {
		if (mode !== 'cosmos' || element.zIndex === 0) return 0;
		const h = hashString(element.imageId);
		// Map uint32 to [-3, +3] degrees
		return ((h % 601) / 100) - 3;
	});

	let left = $derived(`${element.x * 100}%`);
	let topPct = $derived(Math.min(element.y, 0.66) * 100);
	let top = $derived(`${topPct}%`);
	let width = $derived(`${element.width * 100}%`);
	let heightPct = $derived(Math.min(element.height, 0.68 - Math.min(element.y, 0.66)) * 100);
	let height = $derived(`${Math.max(heightPct, 8)}%`);
	let flip = $derived(element.flipHorizontal ? -1 : 1);
	let transform = $derived(
		`rotate(${element.rotation + jitterDeg}deg) scaleX(${flip})`
	);
	let isBackground = $derived(element.zIndex === 0);
	let isCosmosForeground = $derived(mode === 'cosmos' && !isBackground);
</script>

<div
	class="ehon-element"
	style:left
	style:top
	style:width
	style:height
	style:transform
	style:z-index={element.zIndex}
>
	{#if resolvedSrc}
		<img
			src={resolvedSrc}
			alt={element.image.title}
			class:foreground={!isBackground}
			class:cosmos-outline={isCosmosForeground}
			draggable="false"
		/>
	{:else if loadFailed}
		<div class="load-fail" aria-label={element.image.title}>?</div>
	{:else}
		<div class="load-pending" aria-hidden="true"></div>
	{/if}
</div>

<style>
	.ehon-element {
		position: absolute;
		pointer-events: none;
		transform-origin: center center;
		animation: elementIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) backwards;
	}

	.ehon-element img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		-webkit-user-drag: none;
		user-select: none;
	}

	.load-pending,
	.load-fail {
		width: 100%;
		height: 100%;
	}

	.load-fail {
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(107, 62, 31, 0.5);
		font-size: 2rem;
		font-weight: 700;
		font-family: 'Klee One', serif;
	}

	.ehon-element img.foreground {
		mix-blend-mode: multiply;
		filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.15));
	}

	/* Cosmos only: thin hand-drawn dark-brown outline around white PNGs
	   (Eric Carle style) to unify the palette and kill edge-whiteness. */
	.ehon-element img.foreground.cosmos-outline {
		filter:
			drop-shadow(1px 0 0 #6b3e1f)
			drop-shadow(-1px 0 0 #6b3e1f)
			drop-shadow(0 1px 0 #6b3e1f)
			drop-shadow(0 -1px 0 #6b3e1f)
			drop-shadow(0 6px 10px rgba(0, 0, 0, 0.15));
	}

	@keyframes elementIn {
		0% {
			opacity: 0;
			transform: rotate(var(--r, 0deg)) scale(0.85);
		}
		100% {
			opacity: 1;
		}
	}
</style>
