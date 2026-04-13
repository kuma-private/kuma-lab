<script lang="ts">
	import { quiz } from '$lib/stores/quiz.svelte';
	import { ehon } from '$lib/stores/ehon.svelte';
	import { nazenaze } from '$lib/stores/nazenaze.svelte';
	import GenreSelect from '$lib/components/GenreSelect.svelte';
	import QuizScreen from '$lib/components/QuizScreen.svelte';
	import CompleteScreen from '$lib/components/CompleteScreen.svelte';
	import EhonModeSelect from '$lib/components/EhonModeSelect.svelte';
	import EhonInput from '$lib/components/EhonInput.svelte';
	import EhonLoading from '$lib/components/EhonLoading.svelte';
	import EhonViewer from '$lib/components/EhonViewer.svelte';
	import NazenazeInput from '$lib/components/NazenazeInput.svelte';
	import NazenazeViewer from '$lib/components/NazenazeViewer.svelte';

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
		if (theme && !ehon.active && !nazenaze.active) {
			document.body.setAttribute('data-theme', theme);
		} else {
			document.body.removeAttribute('data-theme');
		}
	});

	$effect(() => {
		if (ehon.active) {
			const m = ehon.story?.mode ?? ehon.mode ?? 'cosmos';
			document.body.setAttribute('data-ehon-mode', m);
		} else {
			document.body.removeAttribute('data-ehon-mode');
		}
	});
</script>

<main class:ehon-main={ehon.active || nazenaze.active}>
	{#if nazenaze.active}
		{#if nazenaze.phase === 'input'}
			<NazenazeInput />
		{:else if nazenaze.phase === 'loading'}
			<EhonLoading />
		{:else if nazenaze.phase === 'viewer'}
			<NazenazeViewer />
		{:else if nazenaze.phase === 'error'}
			<div class="ehon-error">
				<p>{nazenaze.errorMessage}</p>
				<button onclick={() => nazenaze.reset()}>もういちど</button>
				<button onclick={() => nazenaze.exit()}>ほーむへ</button>
			</div>
		{/if}
	{:else if ehon.active}
		{#if ehon.phase === 'mode-select'}
			<EhonModeSelect />
		{:else if ehon.phase === 'cosmos-input'}
			<EhonInput />
		{:else if ehon.phase === 'loading'}
			<EhonLoading />
		{:else if ehon.phase === 'viewer'}
			<EhonViewer />
		{:else if ehon.phase === 'error'}
			<div class="ehon-error">
				<p>{ehon.errorMessage}</p>
				<button onclick={() => ehon.reset()}>もういちど</button>
				<button onclick={() => ehon.exit()}>ほーむへ</button>
			</div>
		{/if}
	{:else if quiz.phase === 'select'}
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

	main.ehon-main {
		padding: 30px 20px 60px;
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

	.ehon-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 18px;
		padding: 40px 24px;
		background: rgba(255, 255, 255, 0.95);
		border: 1.5px solid rgba(90, 50, 20, 0.3);
		border-radius: 20px;
		max-width: 90vw;
	}

	.ehon-error p {
		color: #b91c1c;
		font-weight: 700;
		text-align: center;
	}

	.ehon-error button {
		padding: 10px 24px;
		border-radius: 999px;
		background: linear-gradient(135deg, #ffcf6b, #e8890a);
		color: #3d2b1f;
		font-weight: 800;
	}
</style>
