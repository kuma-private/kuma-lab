<script lang="ts">
	import { tower } from '$lib/stores/tower.svelte';
</script>

<div class="input-wrap">
	<button class="back-btn" onclick={() => tower.exit()} aria-label="もどる">
		&larr; ほーむへ
	</button>

	<div class="title-area">
		<span class="deco">&#x1F418;</span>
		<h1 class="title">どうぶつタワー</h1>
		<span class="deco">&#x1F418;</span>
	</div>
	<p class="sub">いらすとや を つみあげよう!</p>

	{#if tower.best > 0}
		<p class="best">ベスト: {tower.best} ひき</p>
	{/if}

	<button class="start-btn" onclick={() => tower.start()}>
		スタート!
	</button>

	{#if tower.errorMessage}
		<p class="error">{tower.errorMessage}</p>
	{/if}
</div>

<style>
	.input-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 60px 20px 40px;
		width: min(520px, 94vw);
	}

	.back-btn {
		position: absolute;
		top: 8px;
		left: 8px;
		background: rgba(255, 255, 255, 0.9);
		color: #3d2b1f;
		border: 1.5px solid rgba(90, 50, 20, 0.3);
		padding: 8px 16px;
		font-size: 0.9rem;
		font-weight: 700;
		border-radius: 999px;
		z-index: 10;
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.deco {
		font-size: 2rem;
	}

	.title {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: clamp(1.7rem, 4vw, 2.4rem);
		font-weight: 900;
		background: linear-gradient(135deg, #5c6bc0 0%, #3949ab 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		letter-spacing: 0.06em;
	}

	.sub {
		font-size: 1rem;
		font-weight: 700;
		color: #3d2b1f;
		opacity: 0.85;
	}

	.best {
		font-size: 1.1rem;
		font-weight: 800;
		color: #5c6bc0;
		padding: 10px 22px;
		background: rgba(255, 255, 255, 0.9);
		border: 1.5px solid rgba(92, 107, 192, 0.35);
		border-radius: 999px;
	}

	.start-btn {
		padding: 18px 56px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 1.3rem;
		font-weight: 900;
		letter-spacing: 0.06em;
		background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
		color: #fff;
		box-shadow:
			0 8px 20px rgba(249, 115, 22, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
		transition: transform 0.15s ease;
	}

	.start-btn:active {
		transform: scale(0.94);
	}

	.error {
		font-size: 0.9rem;
		font-weight: 700;
		color: #b91c1c;
		padding: 10px 18px;
		background: #fee2e2;
		border-radius: 14px;
		max-width: 90vw;
		text-align: center;
	}
</style>
