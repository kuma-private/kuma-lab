<script lang="ts">
	import { quiz } from '../stores/quiz.svelte';
	import { speak, initAudio } from '../speech';
	import { isSupported as micSupported, startListening, stop as stopListening } from '../recognition';
	import ProgressDots from './ProgressDots.svelte';
	import QuizCard from './QuizCard.svelte';
	import Confetti from './Confetti.svelte';

	let showConfetti = $state(false);
	let showNext = $state(false);
	let shakeInput = $state(false);
	let inputText = $state('');
	let listening = $state(false);
	let inputEl: HTMLInputElement;

	function handleSubmit() {
		if (quiz.revealed) return;

		initAudio(); // ensure audio works on mobile

		const correct = quiz.checkAnswer(inputText);

		if (correct) {
			const item = quiz.items[quiz.currentIndex];
			speak(`${item.name}! ${item.sound}`).catch(() => {}); // fire-and-forget
			showConfetti = true;
			inputText = '';
			setTimeout(() => { showNext = true; }, 1800);
		} else {
			shakeInput = true;
			setTimeout(() => { shakeInput = false; }, 500);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Ignore Enter during IME composition (Japanese input)
		if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleHint() {
		initAudio();
		quiz.useHint();

		if (quiz.revealed) {
			// Gave up - no confetti
			const item = quiz.items[quiz.currentIndex];
			speak(`こたえは、${item.name}`).catch(() => {});
			inputText = '';
			setTimeout(() => { showNext = true; }, 1500);
		}
	}

	function toggleMic() {
		initAudio();

		if (listening) {
			stopListening();
			listening = false;
		} else {
			listening = true;
			startListening(
				(text) => {
					inputText = text;
					listening = false;
					// Auto-check on voice result
					setTimeout(() => handleSubmit(), 200);
				},
				() => { listening = false; }
			);
		}
	}

	function handleNext() {
		showConfetti = false;
		showNext = false;
		inputText = '';
		quiz.nextQuestion();
		// Focus input for next question
		setTimeout(() => inputEl?.focus(), 100);
	}

	let prevIndex = $state(-1);
	$effect(() => {
		const idx = quiz.currentIndex;
		if (idx !== prevIndex) {
			prevIndex = idx;
			showConfetti = false;
			showNext = false;
			shakeInput = false;
			inputText = '';
		}
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

	{#if !quiz.revealed}
		<div class="stage-label pop-in">
			&#x1F50D; これ、なーんだ?
		</div>
	{:else if quiz.scores[quiz.currentIndex] > 0}
		<div class="stage-label pop-in correct">
			&#x1F389; せいかい!
		</div>
	{:else}
		<div class="stage-label pop-in giveup">
			&#x1F4A8; ざんねん！
		</div>
	{/if}

	<div class="card-area">
		<QuizCard
			item={quiz.items[quiz.currentIndex]}
			blurStage={quiz.blurStage}
			revealed={quiz.revealed}
		/>
	</div>

	{#if showConfetti}
		<Confetti />
	{/if}

	<!-- Answer input area -->
	{#if !quiz.revealed}
		<div class="input-area" class:shake={shakeInput}>
			{#if quiz.closeAnswer}
				<div class="close-msg pop-in">{'\u{1F525}'} おしい！</div>
			{:else if quiz.wrongAnswer}
				<div class="wrong-msg pop-in">{'\u274C'} ちがうよ〜</div>
			{/if}

			<div class="input-row">
				<input
					bind:this={inputEl}
					bind:value={inputText}
					onkeydown={handleKeydown}
					type="text"
					placeholder="こたえを いれてね"
					autocomplete="off"
					class="answer-input"
				/>
				<button class="submit-btn" onclick={handleSubmit} disabled={!inputText.trim()}>
					こたえる
				</button>
			</div>

			{#if micSupported()}
				<button class="mic-btn" class:listening onclick={toggleMic}>
					{listening ? '\u{1F534} きいてるよ...' : '\u{1F3A4} こえで こたえる'}
				</button>
			{/if}

			{#if quiz.hintsUsed < 3}
				<button class="hint-btn" onclick={handleHint}>
					{'\u{1F4A1}'} ヒントをもらう（のこり {3 - quiz.hintsUsed}）
				</button>
			{/if}
		</div>
	{:else}
		<div class="bottom-area">
			{#if showNext}
				<button class="next-btn pop-in" onclick={handleNext}>
					{#if quiz.currentIndex < quiz.items.length - 1}
						つぎへ &#x1F449;
					{:else}
						&#x1F389; けっかをみる!
					{/if}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.quiz-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 8px 16px 16px;
		width: 100%;
		max-width: 420px;
	}

	.top-bar {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
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
		font-size: 1rem;
		font-weight: 700;
		color: var(--text);
		padding: 4px 18px;
		background: var(--surface);
		border-radius: 20px;
		box-shadow: var(--shadow);
	}

	.stage-label.correct {
		background: var(--primary);
		color: white;
	}

	.stage-label.giveup {
		background: var(--text-light);
		color: white;
	}

	.card-area {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	/* Input area */
	.input-area {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
	}

	.input-area.shake {
		animation: wiggle 0.4s ease-in-out;
	}

	.wrong-msg {
		font-size: 1rem;
		font-weight: 700;
		color: #E57373;
		padding: 4px 16px;
		background: #FFEBEE;
		border-radius: 16px;
	}

	.close-msg {
		font-size: 1.1rem;
		font-weight: 900;
		color: var(--primary);
		padding: 6px 20px;
		background: #FFF3E0;
		border-radius: 16px;
	}

	.input-row {
		display: flex;
		gap: 8px;
		width: 100%;
		max-width: 340px;
	}

	.answer-input {
		flex: 1;
		padding: 14px 18px;
		font-size: 1.1rem;
		font-weight: 700;
		font-family: inherit;
		border: 3px solid var(--primary-light);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		outline: none;
		transition: border-color 0.2s;
	}

	.answer-input:focus {
		border-color: var(--primary);
	}

	.answer-input::placeholder {
		color: var(--primary-light);
		font-weight: 400;
	}

	.submit-btn {
		padding: 14px 24px;
		border-radius: 20px;
		background: var(--primary);
		color: white;
		font-size: 1rem;
		font-weight: 900;
		box-shadow: var(--shadow);
		transition: transform 0.2s, opacity 0.2s;
		white-space: nowrap;
	}

	.submit-btn:disabled {
		opacity: 0.3;
	}

	.submit-btn:active {
		transform: scale(0.93);
	}

	.mic-btn {
		padding: 10px 24px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: var(--shadow);
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-light);
		display: flex;
		align-items: center;
		gap: 6px;
		transition: transform 0.2s;
	}

	.mic-btn.listening {
		background: #FFEBEE;
		color: #E57373;
		animation: pulse 1s ease-in-out infinite;
	}

	.mic-btn:active {
		transform: scale(0.93);
	}

	.hint-btn {
		padding: 10px 24px;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--primary);
		background: var(--surface);
		border-radius: 20px;
		box-shadow: var(--shadow);
		transition: transform 0.2s;
	}

	.hint-btn:active {
		transform: scale(0.95);
	}

	/* Bottom area */
	.bottom-area {
		min-height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.next-btn {
		padding: 16px 48px;
		font-size: 1.3rem;
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
