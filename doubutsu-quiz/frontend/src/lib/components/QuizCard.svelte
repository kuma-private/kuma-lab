<script lang="ts">
	import type { QuizItem, BlurStage } from '../types';

	let {
		item,
		blurStage,
		revealed,
		ontap
	}: {
		item: QuizItem;
		blurStage: BlurStage;
		revealed: boolean;
		ontap: () => void;
	} = $props();

	const blurValues = [22, 12, 5, 0];

	let imgError = $state(false);

	function handleImgError() {
		imgError = true;
	}

	// Name hint: reveal characters progressively
	// Stage 0: 1 char open (first char)
	// Stage 1: ~20% open
	// Stage 2: ~40% open
	// Stage 3: all open
	function getHintText(name: string, stage: BlurStage): string {
		const chars = [...name];
		const len = chars.length;
		if (stage === 3) return name;

		let revealCount: number;
		if (stage === 0) {
			revealCount = 1; // Always show first char
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
	<button class="card" onclick={ontap} class:revealed>
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

		{#if !revealed}
			<div class="tap-hint">
				<span class="tap-finger">&#x1F449;</span>
				<span class="tap-text">タップ!</span>
			</div>
		{/if}

		{#if revealed}
			<div class="name-reveal pop-in">
				<span class="name-text">{item.name}!</span>
			</div>
		{/if}
	</button>

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

	/* Hint text */
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

	/* Card */
	.card {
		width: min(82vw, 340px);
		height: min(82vw, 340px);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: transform 0.2s ease, box-shadow 0.3s ease;
	}

	.card:active {
		transform: scale(0.96);
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
		padding: 24px;
	}

	.image-wrapper img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		user-select: none;
		pointer-events: none;
	}

	.fallback-emoji {
		font-size: 6rem;
	}

	/* Tap hint */
	.tap-hint {
		position: absolute;
		bottom: 18px;
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(255, 255, 255, 0.95);
		padding: 10px 20px;
		border-radius: 24px;
		font-weight: 700;
		color: var(--primary);
		box-shadow: var(--shadow), 0 0 0 2px var(--primary-light);
	}

	.tap-finger {
		font-size: 1.4rem;
		animation: tapPulse 1.2s ease-in-out infinite;
	}

	.tap-text {
		font-size: 1rem;
	}

	/* Name reveal */
	.name-reveal {
		position: absolute;
		bottom: 14px;
		background: linear-gradient(135deg, var(--primary), var(--primary-dark));
		padding: 10px 28px;
		border-radius: 24px;
		box-shadow: 0 4px 16px rgba(0,0,0,0.15);
	}

	.name-text {
		font-size: clamp(0.9rem, 4vw, 1.4rem);
		font-weight: 900;
		color: white;
		text-shadow: 0 1px 2px rgba(0,0,0,0.1);
		text-align: center;
		line-height: 1.3;
	}

	/* Sound bubble */
	.sound-bubble {
		background: var(--surface);
		padding: 14px 28px;
		border-radius: 24px;
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--primary);
		box-shadow: var(--shadow);
		display: flex;
		align-items: center;
		gap: 8px;
		position: relative;
	}

	.sound-icon {
		font-size: 1.2rem;
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

	/* Description */
	.description {
		background: var(--surface);
		padding: 12px 20px;
		border-radius: 16px;
		box-shadow: var(--shadow);
		max-width: min(82vw, 340px);
	}

	.description p {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-light);
		line-height: 1.6;
		text-align: center;
	}
</style>
