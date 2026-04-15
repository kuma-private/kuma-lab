<script lang="ts">
	import { tower } from '$lib/stores/tower.svelte';

	const isNewRecord = $derived(tower.score === tower.best && tower.score > 0);
</script>

<div class="wrap">
	<h2 class="heading">ゲームオーバー</h2>

	<div class="score-card">
		<p class="score-label">スコア</p>
		<p class="score">{tower.score} <span class="unit">ひき</span></p>
		<p class="best">ベスト: {tower.best} ひき</p>
		{#if isNewRecord}
			<p class="new-record">&#x1F389; しんきろく!</p>
		{/if}
	</div>

	<div class="actions">
		<button class="retry" onclick={() => tower.reset()}>もういっかい</button>
		<button class="home" onclick={() => tower.exit()}>ほーむへ</button>
	</div>
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 28px;
		padding: 48px 20px;
		width: min(480px, 94vw);
	}

	.heading {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: clamp(1.6rem, 4vw, 2.2rem);
		font-weight: 900;
		background: linear-gradient(135deg, #5c6bc0 0%, #3949ab 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		letter-spacing: 0.08em;
	}

	.score-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 32px 40px;
		background: rgba(255, 255, 255, 0.95);
		border: 2px solid rgba(92, 107, 192, 0.4);
		border-radius: 24px;
		box-shadow: 0 12px 28px rgba(20, 10, 0, 0.12);
		min-width: 240px;
	}

	.score-label {
		font-size: 0.85rem;
		font-weight: 800;
		color: #6b3e1f;
		letter-spacing: 0.1em;
	}

	.score {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: 3.4rem;
		font-weight: 900;
		color: #3949ab;
		line-height: 1;
		margin: 4px 0;
	}

	.unit {
		font-size: 1.4rem;
		color: #6b3e1f;
	}

	.best {
		font-size: 0.95rem;
		font-weight: 800;
		color: #6b3e1f;
		margin-top: 6px;
	}

	.new-record {
		margin-top: 8px;
		font-size: 1.1rem;
		font-weight: 900;
		color: #f97316;
		animation: pop 0.6s ease-out;
	}

	@keyframes pop {
		0% {
			transform: scale(0.5);
			opacity: 0;
		}
		60% {
			transform: scale(1.15);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.actions {
		display: flex;
		gap: 14px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.retry,
	.home {
		padding: 14px 28px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		transition: transform 0.15s ease;
	}

	.retry {
		background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%);
		color: #fff;
		box-shadow: 0 6px 16px rgba(249, 115, 22, 0.38);
	}

	.home {
		background: rgba(255, 255, 255, 0.92);
		color: #3d2b1f;
		border: 1.5px solid rgba(90, 50, 20, 0.3);
	}

	.retry:active,
	.home:active {
		transform: scale(0.94);
	}
</style>
