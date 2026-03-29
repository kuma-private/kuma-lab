<script lang="ts">
	import { quiz } from '../stores/quiz.svelte';
	import { speak } from '../speech';
	import Confetti from './Confetti.svelte';
	import { onMount } from 'svelte';

	let entered = $state(false);
	let showReview = $state(false);

	onMount(() => {
		speak('やったー! ぜんぶ できたね! すごーい!');
		setTimeout(() => { entered = true; }, 100);
		setTimeout(() => { showReview = true; }, 800);
	});

	function speakItem(name: string, sound: string) {
		speak(`${name}! ${sound}`);
	}
</script>

<div class="complete-screen" class:entered>
	<Confetti />

	<div class="trophy-area">
		<span class="deco-star left float" style="animation-delay: 0s">&#x2B50;</span>
		<span class="trophy pop-in">&#x1F3C6;</span>
		<span class="deco-star right float" style="animation-delay: 0.5s">&#x2B50;</span>
	</div>

	<div class="message-area pop-in" style="animation-delay: 0.2s">
		<h1 class="message">ぜんぶ できたね!</h1>
		<p class="sub-message">すごーい!! &#x1F44F;&#x1F44F;&#x1F44F;</p>
	</div>

	<div class="score pop-in" style="animation-delay: 0.4s">
		<span class="score-num">{quiz.items.length}</span>
		<span class="score-label">もん クリア!</span>
	</div>

	<!-- Review cards -->
	{#if showReview}
		<div class="review-section">
			<h2 class="review-title">&#x1F4D6; きょうの もんだい</h2>
			<div class="review-grid">
				{#each quiz.items as item, i}
					<button
						class="review-card pop-in"
						style="animation-delay: {0.1 * i}s"
						onclick={() => speakItem(item.name, item.sound)}
					>
						<div class="review-num">{i + 1}</div>
						<div class="review-img-wrap">
							<img src={item.url} alt={item.name} draggable="false" />
						</div>
						<div class="review-info">
							<span class="review-name">{item.name}</span>
							<span class="review-sound">&#x1F50A; {item.sound}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="buttons pop-in" style="animation-delay: 0.6s">
		<button class="btn replay" onclick={() => quiz.replay()}>
			&#x1F504; もういっかい
		</button>
		<button class="btn back" onclick={() => quiz.reset()}>
			&#x1F3E0; もどる
		</button>
	</div>
</div>

<style>
	.complete-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 20px;
		padding-bottom: 40px;
		text-align: center;
		opacity: 0;
		transform: translateY(20px);
		transition: opacity 0.5s ease, transform 0.5s ease;
		width: 100%;
		max-width: 500px;
	}

	.complete-screen.entered {
		opacity: 1;
		transform: translateY(0);
	}

	.trophy-area {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.trophy {
		font-size: 4rem;
	}

	.deco-star {
		font-size: 1.8rem;
	}

	.message-area {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.message {
		font-size: 1.8rem;
		font-weight: 900;
		color: var(--primary);
	}

	.sub-message {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-light);
	}

	.score {
		background: var(--surface);
		padding: 12px 28px;
		border-radius: 20px;
		box-shadow: var(--shadow);
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.score-num {
		font-size: 2.2rem;
		font-weight: 900;
		color: var(--primary);
	}

	.score-label {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-light);
	}

	/* Review section */
	.review-section {
		width: 100%;
	}

	.review-title {
		font-size: 1.1rem;
		font-weight: 900;
		color: var(--text);
		margin-bottom: 12px;
	}

	.review-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
		width: 100%;
	}

	.review-card {
		background: var(--surface);
		border-radius: 16px;
		padding: 10px;
		box-shadow: var(--shadow);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		position: relative;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.review-card:active {
		transform: scale(0.96);
		box-shadow: var(--shadow-glow);
	}

	.review-num {
		position: absolute;
		top: 6px;
		left: 8px;
		font-size: 0.65rem;
		font-weight: 900;
		color: white;
		background: var(--primary);
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.review-img-wrap {
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.review-img-wrap img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		pointer-events: none;
	}

	.review-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.review-name {
		font-size: 0.85rem;
		font-weight: 900;
		color: var(--text);
	}

	.review-sound {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--primary);
	}

	/* Buttons */
	.buttons {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: center;
		width: 100%;
	}

	.btn {
		padding: 16px 32px;
		font-size: 1.1rem;
		font-weight: 900;
		border-radius: 50px;
		display: flex;
		align-items: center;
		gap: 8px;
		box-shadow: var(--shadow);
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		letter-spacing: 1px;
	}

	.btn:active {
		transform: scale(0.93);
	}

	.replay {
		background: linear-gradient(135deg, var(--primary), var(--primary-dark));
		color: white;
	}

	.back {
		background: var(--surface);
		color: var(--text);
	}

	@media (max-width: 400px) {
		.review-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}

		.review-img-wrap {
			width: 56px;
			height: 56px;
		}

		.message {
			font-size: 1.5rem;
		}

		.buttons {
			flex-direction: column;
			align-items: center;
		}
	}
</style>
