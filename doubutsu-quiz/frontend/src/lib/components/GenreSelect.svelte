<script lang="ts">
	import { quiz } from '../stores/quiz.svelte';

	let entered = $state(false);

	$effect(() => {
		setTimeout(() => { entered = true; }, 100);
	});
</script>

<div class="genre-select" class:entered>
	<div class="title-area">
		<span class="title-deco float" style="animation-delay: 0s">&#x2728;</span>
		<h1 class="title">なにで あそぶ?</h1>
		<span class="title-deco float" style="animation-delay: 0.5s">&#x2728;</span>
	</div>

	<div class="buttons">
		<button class="genre-btn doubutsu" onclick={() => quiz.startQuiz('doubutsu')}>
			<div class="btn-bg"></div>
			<span class="genre-icon bounce" style="animation-delay: 0.2s">&#x1F418;</span>
			<span class="genre-label">どうぶつ</span>
			<span class="genre-sub">いぬ、ねこ、ぞう...</span>
		</button>

		<button class="genre-btn yasai" onclick={() => quiz.startQuiz('yasai')}>
			<div class="btn-bg"></div>
			<span class="genre-icon bounce" style="animation-delay: 0.4s">&#x1F955;</span>
			<span class="genre-label">やさい</span>
			<span class="genre-sub">にんじん、トマト...</span>
		</button>
	</div>

	{#if quiz.error}
		<p class="error pop-in">{quiz.error}</p>
	{/if}
</div>

<style>
	.genre-select {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 48px;
		padding: 20px;
		opacity: 0;
		transform: translateY(20px);
		transition: opacity 0.6s ease, transform 0.6s ease;
	}

	.genre-select.entered {
		opacity: 1;
		transform: translateY(0);
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.title {
		font-size: 2.2rem;
		font-weight: 900;
		color: var(--text);
		text-align: center;
	}

	.title-deco {
		font-size: 1.8rem;
	}

	.buttons {
		display: flex;
		gap: 28px;
		flex-wrap: wrap;
		justify-content: center;
	}

	.genre-btn {
		width: 210px;
		height: 240px;
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		box-shadow: var(--shadow-lg);
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
		position: relative;
		overflow: hidden;
		animation: bounceIn 0.6s ease-out backwards;
	}

	.genre-btn:nth-child(2) {
		animation-delay: 0.15s;
	}

	.genre-btn:active {
		transform: scale(0.93);
	}

	.genre-btn:hover {
		box-shadow: var(--shadow-glow);
	}

	.doubutsu {
		background: linear-gradient(145deg, #FFE0B2, #FFB74D);
	}

	.yasai {
		background: linear-gradient(145deg, #B2DFDB, #4DB6AC);
	}

	.genre-icon {
		font-size: 4.5rem;
	}

	.genre-label {
		font-size: 1.5rem;
		font-weight: 900;
		color: var(--text);
	}

	.genre-sub {
		font-size: 0.75rem;
		font-weight: 400;
		color: var(--text-light);
		opacity: 0.8;
	}

	.error {
		color: #E57373;
		font-size: 0.9rem;
		text-align: center;
		padding: 12px 20px;
		background: #FFEBEE;
		border-radius: 16px;
		max-width: 90vw;
		word-break: break-all;
	}
</style>
