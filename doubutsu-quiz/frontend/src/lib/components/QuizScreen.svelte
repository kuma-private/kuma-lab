<script lang="ts">
	import { quiz } from '../stores/quiz.svelte';
	import { speak } from '../speech';
	import ProgressDots from './ProgressDots.svelte';
	import QuizCard from './QuizCard.svelte';
	import Confetti from './Confetti.svelte';

	let showConfetti = $state(false);
	let showNext = $state(false);
	let shakeCard = $state(false);

	function handleTap() {
		if (quiz.revealed) return;

		quiz.tap();

		// Quick shake feedback on intermediate taps
		if (!quiz.revealed) {
			shakeCard = true;
			setTimeout(() => { shakeCard = false; }, 300);
		}

		if (quiz.revealed) {
			const item = quiz.items[quiz.currentIndex];
			speak(`${item.name}! ${item.sound}`);
			showConfetti = true;

			setTimeout(() => {
				showNext = true;
			}, 1800);
		}
	}

	function handleNext() {
		showConfetti = false;
		showNext = false;
		quiz.nextQuestion();
	}

	$effect(() => {
		quiz.currentIndex;
		showConfetti = false;
		showNext = false;
		shakeCard = false;
	});
</script>

<div class="quiz-screen">
	<div class="top-bar">
		<div class="question-num">
			<span class="q-current">{quiz.currentIndex + 1}</span>
			<span class="q-sep">/</span>
			<span class="q-total">{quiz.items.length}</span>
		</div>
		<ProgressDots total={quiz.items.length} current={quiz.currentIndex} />
	</div>

	<div class="stage-label pop-in">
		{#if quiz.blurStage === 0}
			&#x1F50D; なにかな?
		{:else if quiz.blurStage === 1}
			&#x1F914; んー...
		{:else if quiz.blurStage === 2}
			&#x1F4A1; もうすこし!
		{:else}
			&#x1F389; せいかい!
		{/if}
	</div>

	<div class="card-area" class:shake={shakeCard}>
		<QuizCard
			item={quiz.items[quiz.currentIndex]}
			blurStage={quiz.blurStage}
			revealed={quiz.revealed}
			ontap={handleTap}
		/>
	</div>

	{#if showConfetti}
		<Confetti />
	{/if}

	{#if showNext}
		<button class="next-btn pop-in" onclick={handleNext}>
			{#if quiz.currentIndex < quiz.items.length - 1}
				つぎへ &#x1F449;
			{:else}
				&#x1F389; おしまい!
			{/if}
		</button>
	{/if}
</div>

<style>
	.quiz-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		width: 100%;
		max-width: 420px;
	}

	.top-bar {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.question-num {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-light);
	}

	.q-current {
		font-size: 1.1rem;
		color: var(--primary);
	}

	.stage-label {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text);
		padding: 6px 20px;
		background: var(--surface);
		border-radius: 20px;
		box-shadow: var(--shadow);
	}

	.card-area {
		transition: transform 0.1s ease;
	}

	.card-area.shake {
		animation: wiggle 0.3s ease-in-out;
	}

	.next-btn {
		margin-top: 8px;
		padding: 18px 52px;
		font-size: 1.4rem;
		font-weight: 900;
		color: white;
		background: linear-gradient(135deg, var(--primary), var(--primary-dark));
		border-radius: 50px;
		box-shadow: var(--shadow-lg), var(--shadow-glow);
		transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		letter-spacing: 2px;
	}

	.next-btn:active {
		transform: scale(0.93);
	}
</style>
