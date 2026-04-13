<script lang="ts">
	import { ehon } from '$lib/stores/ehon.svelte';

	function pick(mode: 'chaos' | 'cosmos') {
		ehon.selectMode(mode);
	}
</script>

<div class="mode-select">
	<button class="back-btn" onclick={() => ehon.exit()} aria-label="もどる">
		&larr; もどる
	</button>

	<div class="title-area">
		<h1 class="title">どんな えほんに する？</h1>
		<p class="subtitle">モードを えらんでね</p>
	</div>

	<div class="cards">
		<button class="card cosmos" onclick={() => pick('cosmos')}>
			<div class="card-bg cosmos-bg"></div>
			<div class="card-inner">
				<div class="card-icon">&#x1F319;</div>
				<div class="card-title">えほんをつくる</div>
				<div class="card-desc">
					しゅじんこうと ぶたいを<br />
					えらんで やさしい おはなしに
				</div>
				<div class="card-tag">えほんをつくる</div>
			</div>
		</button>

		<button class="card chaos" onclick={() => pick('chaos')}>
			<div class="card-bg chaos-bg"></div>
			<div class="card-inner">
				<div class="card-icon">&#x1F300;</div>
				<div class="card-title">かおすなえほん</div>
				<div class="card-desc">
					なにが でるかな？<br />
					ぜんぶ おまかせ！
				</div>
				<div class="card-tag">かおすなえほんをつくる</div>
			</div>
		</button>
	</div>
</div>

<style>
	.mode-select {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 36px;
		padding: 40px 20px;
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
		text-align: center;
	}

	.title {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: clamp(1.6rem, 4vw, 2.4rem);
		font-weight: 700;
		color: #3d2b1f;
		text-shadow: 0 2px 0 rgba(255, 255, 255, 0.6);
		margin-bottom: 6px;
	}

	.subtitle {
		font-size: 0.95rem;
		color: #6b3e1f;
		opacity: 0.8;
	}

	.cards {
		display: flex;
		gap: 28px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.card {
		width: 280px;
		min-height: 340px;
		border-radius: 24px;
		position: relative;
		overflow: hidden;
		box-shadow: 0 18px 40px rgba(20, 10, 0, 0.18), 0 6px 14px rgba(0, 0, 0, 0.1);
		transition:
			transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
			box-shadow 0.3s ease;
		animation: cardIn 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
		border: 3px solid rgba(255, 255, 255, 0.8);
	}

	.card:nth-child(2) {
		animation-delay: 0.15s;
	}

	.card:active {
		transform: scale(0.96);
	}

	.card:hover {
		transform: translateY(-4px);
	}

	.card-bg {
		position: absolute;
		inset: 0;
	}

	.cosmos-bg {
		background:
			radial-gradient(ellipse at 30% 20%, #fff8e1 0%, transparent 55%),
			linear-gradient(180deg, #e0f2fe 0%, #fce7f3 50%, #fef3c7 100%);
	}

	.cosmos-bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle at 20% 80%, #ffffff 0 2px, transparent 3px),
			radial-gradient(circle at 75% 30%, #ffffff 0 2px, transparent 3px),
			radial-gradient(circle at 60% 70%, #ffffff 0 1.5px, transparent 3px);
		opacity: 0.8;
	}

	.chaos-bg {
		background:
			conic-gradient(
				from 0deg at 50% 50%,
				#ff5e7a 0deg,
				#ffb648 60deg,
				#4ade80 120deg,
				#38bdf8 180deg,
				#a78bfa 240deg,
				#f472b6 300deg,
				#ff5e7a 360deg
			);
		filter: contrast(1.05) saturate(1.15);
	}

	.chaos-bg::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.6), transparent 40%),
			radial-gradient(ellipse at 70% 80%, rgba(0, 0, 0, 0.15), transparent 50%);
		mix-blend-mode: overlay;
	}

	.chaos-bg::after {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle at 15% 25%, #fff 0 2px, transparent 3px),
			radial-gradient(circle at 85% 15%, #fff 0 2px, transparent 3px),
			radial-gradient(circle at 50% 50%, #fff 0 1.5px, transparent 3px),
			radial-gradient(circle at 25% 75%, #fff 0 2px, transparent 3px),
			radial-gradient(circle at 75% 85%, #fff 0 1.5px, transparent 3px);
		opacity: 0.9;
		animation: cardDrift 14s ease-in-out infinite;
	}

	.card-inner {
		position: relative;
		height: 100%;
		min-height: 340px;
		padding: 28px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		color: #3d2b1f;
	}

	.chaos .card-inner {
		color: #1a1033;
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
	}

	.card-icon {
		font-size: 4rem;
		filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.15));
		animation: cardFloat 3.4s ease-in-out infinite;
	}

	.card-title {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: 2rem;
		font-weight: 800;
		letter-spacing: 0.15em;
	}

	.cosmos .card-title {
		background: linear-gradient(135deg, #0ea5e9 0%, #f472b6 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
	}

	.chaos .card-title {
		background: linear-gradient(135deg, #1a1033 0%, #6b21a8 50%, #dc2626 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
	}

	.card-desc {
		font-size: 0.95rem;
		font-weight: 600;
		line-height: 1.6;
	}

	.card-tag {
		margin-top: 6px;
		font-size: 0.8rem;
		padding: 6px 16px;
		background: rgba(255, 255, 255, 0.85);
		color: #3d2b1f;
		border-radius: 999px;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	@keyframes cardIn {
		0% {
			opacity: 0;
			transform: translateY(28px) scale(0.9);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes cardFloat {
		0%,
		100% {
			transform: translateY(0) rotate(0);
		}
		50% {
			transform: translateY(-8px) rotate(4deg);
		}
	}

	@keyframes cardDrift {
		0%,
		100% {
			transform: translate(0, 0);
		}
		50% {
			transform: translate(6px, -6px);
		}
	}
</style>
