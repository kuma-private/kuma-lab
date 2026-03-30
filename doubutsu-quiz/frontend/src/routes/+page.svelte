<script lang="ts">
	import { quiz } from '$lib/stores/quiz.svelte';
	import GenreSelect from '$lib/components/GenreSelect.svelte';
	import QuizScreen from '$lib/components/QuizScreen.svelte';
	import CompleteScreen from '$lib/components/CompleteScreen.svelte';

	let loadingDots = $state('');

	$effect(() => {
		if (quiz.phase === 'loading') {
			const interval = setInterval(() => {
				loadingDots = loadingDots.length >= 3 ? '' : loadingDots + '.';
			}, 500);
			return () => clearInterval(interval);
		}
	});

	$effect(() => {
		const theme = quiz.genre;
		if (theme) {
			document.body.setAttribute('data-theme', theme);
		} else {
			document.body.removeAttribute('data-theme');
		}
	});
</script>

<main>
	{#if quiz.phase === 'select'}
		<GenreSelect />
	{:else if quiz.phase === 'loading'}
		<div class="loading">
			<div class="loading-icons">
				<span class="loading-icon bounce" style="animation-delay: 0s">
					{quiz.genre === 'doubutsu' ? '\u{1F436}' : quiz.genre === 'norimono' ? '\u{1F697}' : '\u{1F345}'}
				</span>
				<span class="loading-icon bounce" style="animation-delay: 0.2s">
					{quiz.genre === 'doubutsu' ? '\u{1F431}' : quiz.genre === 'norimono' ? '\u{1F682}' : '\u{1F955}'}
				</span>
				<span class="loading-icon bounce" style="animation-delay: 0.4s">
					{quiz.genre === 'doubutsu' ? '\u{1F418}' : quiz.genre === 'norimono' ? '\u{2708}' : '\u{1F33D}'}
				</span>
			</div>
			<p class="loading-text">じゅんびちゅう{loadingDots}</p>
			<p class="loading-sub">クイズをつくってるよ!</p>
		</div>
	{:else if quiz.phase === 'quiz'}
		<QuizScreen />
	{:else if quiz.phase === 'complete'}
		<CompleteScreen />
	{/if}
</main>

<style>
	main {
		width: 100%;
		display: flex;
		justify-content: center;
		padding: 20px;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		animation: bounceIn 0.5s ease-out;
	}

	.loading-icons {
		display: flex;
		gap: 16px;
	}

	.loading-icon {
		font-size: 3.5rem;
	}

	.loading-text {
		font-size: 1.4rem;
		font-weight: 900;
		color: var(--text);
		min-width: 180px;
	}

	.loading-sub {
		font-size: 0.9rem;
		font-weight: 400;
		color: var(--text-light);
	}
</style>
