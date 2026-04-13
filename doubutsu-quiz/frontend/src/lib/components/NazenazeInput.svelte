<script lang="ts">
	import { nazenaze } from '$lib/stores/nazenaze.svelte';
	import type { NazenazeMode } from '$lib/types';

	let question = $state(nazenaze.question);
	let mode: NazenazeMode = $state(nazenaze.mode);
	let pageCount = $state(nazenaze.pageCount);

	function submit() {
		nazenaze.setQuestion(question);
		nazenaze.setMode(mode);
		nazenaze.setPageCount(pageCount);
		nazenaze.submit();
	}
</script>

<div class="input-wrap">
	<button class="back-btn" onclick={() => nazenaze.exit()} aria-label="もどる">
		&larr; もどる
	</button>

	<div class="title-area">
		<h1 class="title">なぜなぜモード</h1>
		<p class="subtitle">しつもんを いれてね！ かみしばいで こたえるよ</p>
	</div>

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		<label class="field">
			<span class="label">しつもん</span>
			<textarea
				bind:value={question}
				placeholder="なぜ？ を いれてね  れい: テレビは どうして うつるの？"
				maxlength="120"
				rows="3"
			></textarea>
		</label>

		<div class="field">
			<span class="label">モード</span>
			<div class="mode-toggle">
				<button
					type="button"
					class="mode-btn true"
					class:active={mode === 'true'}
					onclick={() => (mode = 'true')}
				>
					&#x2728; ほんとう
				</button>
				<button
					type="button"
					class="mode-btn false"
					class:active={mode === 'false'}
					onclick={() => (mode = 'false')}
				>
					&#x1F300; うそ
				</button>
			</div>
			<p class="mode-desc">
				{mode === 'true'
					? 'ただしい こたえを かみしばいで！'
					: 'もっともらしい ウソで かみしばいを つくるよ'}
			</p>
		</div>

		<label class="field">
			<span class="label">ページすう</span>
			<div class="page-count">
				{#each [3, 5, 8] as n (n)}
					<button
						type="button"
						class="page-btn"
						class:active={pageCount === n}
						onclick={() => (pageCount = n)}
					>
						{n}
					</button>
				{/each}
			</div>
		</label>

		<div class="actions">
			<button type="submit" class="go" disabled={!question.trim()}>
				こたえを きく &rarr;
			</button>
		</div>
	</form>
</div>

<style>
	.input-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding: 40px 20px;
		width: min(520px, 94vw);
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
		font-size: clamp(1.5rem, 3.5vw, 2.1rem);
		font-weight: 700;
		background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		margin-bottom: 6px;
		letter-spacing: 0.08em;
	}

	.subtitle {
		font-size: 0.9rem;
		color: #6b3e1f;
		opacity: 0.85;
	}

	.form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 18px;
		background: rgba(255, 255, 255, 0.88);
		padding: 28px 24px;
		border-radius: 24px;
		border: 1.5px solid rgba(90, 50, 20, 0.18);
		box-shadow:
			0 12px 30px rgba(20, 10, 0, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.9);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 0.8rem;
		font-weight: 700;
		color: #6b3e1f;
		letter-spacing: 0.05em;
	}

	textarea {
		padding: 12px 14px;
		border-radius: 14px;
		border: 1.5px solid rgba(90, 50, 20, 0.25);
		background: #fffaf0;
		font-family: inherit;
		font-size: 1rem;
		color: #3d2b1f;
		resize: vertical;
		min-height: 80px;
	}

	textarea::placeholder {
		color: #b89477;
	}

	textarea:focus {
		outline: none;
		border-color: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
	}

	.mode-toggle {
		display: flex;
		gap: 10px;
	}

	.mode-btn {
		flex: 1;
		padding: 14px 0;
		border-radius: 14px;
		border: 1.5px solid rgba(90, 50, 20, 0.25);
		background: #fffaf0;
		font-family: inherit;
		font-weight: 800;
		font-size: 1rem;
		color: #3d2b1f;
		transition: all 0.2s ease;
	}

	.mode-btn.true.active {
		background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 4px 10px rgba(14, 165, 233, 0.35);
	}

	.mode-btn.false.active {
		background: linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 4px 10px rgba(109, 40, 217, 0.35);
	}

	.mode-desc {
		font-size: 0.78rem;
		color: #6b3e1f;
		opacity: 0.8;
		margin-top: 4px;
	}

	.page-count {
		display: flex;
		gap: 10px;
	}

	.page-btn {
		flex: 1;
		padding: 10px 0;
		border-radius: 12px;
		border: 1.5px solid rgba(90, 50, 20, 0.25);
		background: #fffaf0;
		font-family: inherit;
		font-weight: 800;
		font-size: 1rem;
		color: #3d2b1f;
		transition: all 0.2s ease;
	}

	.page-btn.active {
		background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
		color: #fff;
		border-color: transparent;
		box-shadow: 0 4px 10px rgba(245, 158, 11, 0.3);
	}

	.actions {
		display: flex;
		gap: 12px;
		margin-top: 6px;
	}

	.go {
		flex: 1;
		padding: 14px 18px;
		border-radius: 999px;
		font-family: inherit;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
		color: #fff;
		box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
		transition: transform 0.15s ease;
	}

	.go:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.go:not(:disabled):active {
		transform: scale(0.95);
	}
</style>
