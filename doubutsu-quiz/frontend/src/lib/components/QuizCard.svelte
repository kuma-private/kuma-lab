<script lang="ts">
	import type { QuizItem, BlurStage } from '../types';

	let {
		item,
		blurStage,
		revealed,
	}: {
		item: QuizItem;
		blurStage: BlurStage;
		revealed: boolean;
	} = $props();

	const blurValues = [22, 12, 5, 0];

	let imgError = $state(false);

	function handleImgError() {
		imgError = true;
	}

	function getHintText(name: string, stage: BlurStage): string {
		const chars = [...name];
		const len = chars.length;
		if (stage === 3) return name;

		let revealCount: number;
		if (stage === 0) {
			revealCount = 1;
		} else if (stage === 1) {
			revealCount = Math.max(2, Math.ceil(len * 0.2));
		} else {
			revealCount = Math.max(3, Math.ceil(len * 0.4));
		}
		revealCount = Math.min(revealCount, len);

		return chars.map((c, i) => i < revealCount ? c : '●').join('');
	}
</script>

<div class="card-container">
	<!-- Name hint area -->
	<div class="hint-area">
		<div class="hint-text" class:revealed>
			{#each [...(revealed ? item.name : getHintText(item.name, blurStage))] as char, i}
				<span
					class="hint-char"
					class:is-dot={char === '●'}
					class:is-revealed={char !== '●'}
					style="animation-delay: {i * 0.05}s"
				>{char}</span>
			{/each}
		</div>
	</div>

	<!-- Image card -->
	<div class="card" class:revealed>
		{#if revealed}
			<div class="reveal-ring"></div>
		{/if}

		<div class="image-wrapper" style="filter: blur({blurValues[blurStage]}px); transition: filter 0.6s ease-out;">
			{#if imgError}
				<div class="fallback-emoji">&#x2753;</div>
			{:else}
				<img
					src={item.url}
					alt={revealed ? item.name : 'なにかな?'}
					onerror={handleImgError}
					draggable="false"
				/>
			{/if}
		</div>
	</div>

	<!-- Sound bubble -->
	{#if revealed}
		<div class="sound-bubble pop-in">
			<span class="sound-icon">&#x1F50A;</span>
			<span>{item.sound}</span>
		</div>
	{/if}

	<!-- Description -->
	{#if revealed && item.description}
		<div class="description pop-in" style="animation-delay: 0.3s">
			<p>{item.description}</p>
		</div>
	{/if}
</div>

<style>
	.card-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.hint-area {
		min-height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hint-text {
		display: flex;
		gap: 1px;
		font-size: clamp(1rem, 4.5vw, 1.6rem);
		font-weight: 900;
		letter-spacing: 2px;
		flex-wrap: wrap;
		justify-content: center;
		max-width: min(82vw, 340px);
	}

	.hint-text.revealed {
		color: var(--primary);
	}

	.hint-char {
		display: inline-block;
		transition: transform 0.3s ease, color 0.3s ease;
	}

	.hint-char.is-dot {
		color: var(--primary-light);
		opacity: 0.6;
	}

	.hint-char.is-revealed {
		color: var(--primary);
		animation: letterPop 0.4s ease-out backwards;
	}

	.card {
		width: min(70vw, 280px);
		height: min(70vw, 280px);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: box-shadow 0.3s ease;
	}

	.card.revealed {
		animation: revealGlow 0.8s ease-out forwards;
	}

	.reveal-ring {
		position: absolute;
		inset: 0;
		border-radius: var(--radius);
		border: 3px solid var(--primary-light);
		opacity: 0.5;
		animation: ripple 1s ease-out;
		pointer-events: none;
	}

	.image-wrapper {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.image-wrapper img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}

	.fallback-emoji {
		font-size: 5rem;
	}

	.sound-bubble {
		background: var(--surface);
		padding: 12px 24px;
		border-radius: 24px;
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--primary);
		box-shadow: var(--shadow);
		display: flex;
		align-items: center;
		gap: 8px;
		position: relative;
	}

	.sound-icon {
		font-size: 1.1rem;
	}

	.sound-bubble::before {
		content: '';
		position: absolute;
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: 8px solid var(--surface);
	}

	.description {
		background: var(--surface);
		padding: 10px 18px;
		border-radius: 16px;
		box-shadow: var(--shadow);
		max-width: min(82vw, 340px);
	}

	.description p {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-light);
		line-height: 1.6;
		text-align: center;
	}
</style>
