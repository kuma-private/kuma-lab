<script lang="ts">
	import { ehon } from '$lib/stores/ehon.svelte';
	import EhonPage from './EhonPage.svelte';

	function goNext() {
		ehon.nextPage();
	}
	function goPrev() {
		ehon.prevPage();
	}
	function restart() {
		ehon.reset();
	}

	// Touch swipe navigation (mobile).
	let touchStartX = 0;
	let touchStartY = 0;
	function onTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}
	function onTouchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
		if (dx < 0) goNext();
		else goPrev();
	}
</script>

{#if ehon.story}
	<div class="viewer-wrap" data-mode={ehon.story.mode}>
		<h2 class="book-title" data-mode={ehon.story.mode}>{ehon.story.title}</h2>

		<div class="frame" ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
			<div class="frame-inner">
				{#key ehon.currentPage}
					<div class="slide">
						<EhonPage page={ehon.story.pages[ehon.currentPage]} mode={ehon.story.mode} />
					</div>
				{/key}
			</div>
		</div>

		<div class="controls">
			<button
				class="ctrl-btn prev"
				onclick={goPrev}
				disabled={ehon.currentPage === 0}
				aria-label="まえのページ"
			>
				&larr; まえへ
			</button>
			<span class="indicator">
				{ehon.currentPage + 1} / {ehon.totalPages}
			</span>
			{#if ehon.isLastPage}
				<button class="ctrl-btn restart" onclick={restart} aria-label="もういっかい">
					もういっかい &#x21BB;
				</button>
			{:else}
				<button class="ctrl-btn next" onclick={goNext} aria-label="つぎのページ">
					つぎへ &rarr;
				</button>
			{/if}
		</div>

		<button class="back-home" onclick={() => ehon.exit()}>&times; ほーむへ</button>
	</div>
{/if}

<style>
	.viewer-wrap {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		max-width: min(640px, 94vw);
		margin: 0 auto;
		padding: 14px 0 18px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.book-title {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: clamp(1.05rem, 4.5vw, 1.55rem);
		font-weight: 800;
		color: #3d2b1f;
		text-align: center;
		margin: 14px 12px 6px;
		letter-spacing: 0.08em;
		line-height: 1.3;
		max-width: 85%;
		word-break: keep-all;
		overflow-wrap: anywhere;
		padding: 8px 22px;
		background: linear-gradient(180deg, #fff8e8 0%, #f4e1b8 100%);
		border: 1.5px solid rgba(107, 62, 31, 0.4);
		border-radius: 999px;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.85),
			0 3px 10px rgba(70, 38, 10, 0.18);
		text-shadow: 0 1px 0 #fff8e8;
	}

	.book-title[data-mode='chaos'] {
		background: linear-gradient(180deg, #fff0f5 0%, #ffe4ba 100%);
		border: 1.5px solid rgba(138, 43, 226, 0.5);
		color: #6a1b9a;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 3px 12px rgba(138, 43, 226, 0.25);
	}

	.frame {
		width: auto;
		max-width: 100%;
		min-height: 0;
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		aspect-ratio: 3 / 4;
		background:
			linear-gradient(145deg, #8a5a2b 0%, #5a3518 35%, #6f4220 70%, #3e2410 100%);
		border-radius: 6px;
		box-shadow:
			inset 0 0 0 2px rgba(255, 220, 170, 0.3),
			inset 0 0 30px rgba(0, 0, 0, 0.4),
			0 18px 40px rgba(40, 20, 5, 0.4),
			0 8px 14px rgba(0, 0, 0, 0.25);
		position: relative;
	}

	.frame::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 6px;
		pointer-events: none;
		background-image:
			repeating-linear-gradient(
				90deg,
				rgba(0, 0, 0, 0.18) 0px,
				rgba(0, 0, 0, 0.18) 1px,
				transparent 1px,
				transparent 7px
			),
			repeating-linear-gradient(
				90deg,
				rgba(255, 220, 170, 0.08) 0px,
				rgba(255, 220, 170, 0.08) 2px,
				transparent 2px,
				transparent 13px
			);
		mix-blend-mode: overlay;
	}

	.frame::after {
		content: '';
		position: absolute;
		top: 8px;
		left: 8px;
		right: 8px;
		bottom: 8px;
		border: 1px solid rgba(255, 220, 170, 0.35);
		border-radius: 3px;
		pointer-events: none;
	}

	.frame-inner {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 2px;
		box-shadow:
			inset 0 0 0 1px rgba(70, 38, 10, 0.5),
			inset 0 0 20px rgba(70, 38, 10, 0.25);
	}

	.slide {
		width: 100%;
		height: 100%;
		animation: slideIn 0.7s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes slideIn {
		0% {
			opacity: 0;
			transform: translateX(40px);
		}
		100% {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
		width: 100%;
		justify-content: center;
		flex-wrap: nowrap;
	}

	.ctrl-btn {
		padding: 10px 18px;
		border-radius: 999px;
		background: linear-gradient(135deg, #ffcf6b 0%, #e8890a 100%);
		color: #3d2b1f;
		font-family: 'Klee One', 'M PLUS Rounded 1c', sans-serif;
		font-size: 0.95rem;
		font-weight: 800;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			0 4px 12px rgba(232, 137, 10, 0.35);
		transition: transform 0.15s ease;
		letter-spacing: 0.03em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.ctrl-btn:not(:disabled):active {
		transform: scale(0.94);
	}

	.ctrl-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.ctrl-btn.restart {
		background: linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%);
		color: #fff;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			0 4px 12px rgba(109, 40, 217, 0.45);
	}

	.indicator {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		color: #3d2b1f;
		font-weight: 700;
		font-size: 0.95rem;
		padding: 5px 12px;
		background: rgba(255, 248, 232, 0.85);
		border: 1px solid rgba(90, 50, 20, 0.3);
		border-radius: 999px;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.back-home {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(255, 248, 232, 0.95);
		color: #3d2b1f;
		border: 1.5px solid rgba(90, 50, 20, 0.45);
		padding: 5px 11px;
		font-size: 0.75rem;
		font-weight: 800;
		border-radius: 999px;
		z-index: 10;
		letter-spacing: 0.02em;
		box-shadow: 0 2px 6px rgba(70, 38, 10, 0.15);
	}

	.viewer-wrap[data-mode='chaos'] .indicator {
		color: #f7e6ff;
		background: rgba(40, 20, 60, 0.85);
		border-color: rgba(255, 200, 120, 0.5);
	}
</style>
