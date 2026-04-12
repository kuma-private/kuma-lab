<script lang="ts">
	let {
		defaultFromBar,
		defaultToBar,
		ticksPerBar,
		hasPreview = false,
		onRequestPreview,
		onApply,
		onCancel
	}: {
		defaultFromBar: number;
		defaultToBar: number;
		ticksPerBar: number;
		hasPreview?: boolean;
		onRequestPreview: (req: {
			prompt: string;
			startTick: number;
			endTick: number;
		}) => Promise<void>;
		onApply: () => void;
		onCancel: () => void;
	} = $props();

	let open = $state(false);
	let prompt = $state('');
	let fromBar = $state<number>(1);
	let toBar = $state<number>(1);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function togglePopover() {
		open = !open;
		if (open) {
			fromBar = defaultFromBar;
			toBar = defaultToBar;
			error = null;
		}
	}

	async function handleGenerate() {
		const trimmed = prompt.trim();
		if (!trimmed || busy) return;
		if (toBar < fromBar) {
			error = 'From/To が逆順です';
			return;
		}
		busy = true;
		error = null;
		try {
			const startTick = (fromBar - 1) * ticksPerBar;
			const endTick = toBar * ticksPerBar;
			await onRequestPreview({ prompt: trimmed, startTick, endTick });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	function handleApply() {
		onApply();
		open = false;
		prompt = '';
	}

	function handleCancel() {
		onCancel();
	}

	function handleClose() {
		open = false;
	}
</script>

<div class="ai-curve-wrap">
	<button
		type="button"
		class="ai-btn"
		class:ai-btn--active={open}
		onclick={togglePopover}
		aria-label="AI でカーブを生成"
		aria-haspopup="dialog"
		aria-expanded={open}
	>
		AI
	</button>
	{#if open}
		<div class="popover" role="dialog" aria-label="AI カーブ生成">
			<div class="head">
				<span class="title">AI カーブ</span>
				<button
					type="button"
					class="close"
					onclick={handleClose}
					aria-label="閉じる"
				>
					×
				</button>
			</div>

			<label class="field">
				<span class="field-label">プロンプト</span>
				<textarea
					class="prompt-input"
					bind:value={prompt}
					placeholder="例: Drop 前のスイープ / サビでクレッシェンド"
					rows="2"
					disabled={busy}
				></textarea>
			</label>

			<div class="range-row">
				<label class="field range-field">
					<span class="field-label">From bar</span>
					<input
						type="number"
						min="1"
						bind:value={fromBar}
						disabled={busy}
						aria-label="From bar"
					/>
				</label>
				<label class="field range-field">
					<span class="field-label">To bar</span>
					<input
						type="number"
						min="1"
						bind:value={toBar}
						disabled={busy}
						aria-label="To bar"
					/>
				</label>
			</div>

			{#if error}
				<div class="err" role="alert">{error}</div>
			{/if}

			<div class="actions">
				{#if hasPreview}
					<button
						type="button"
						class="btn btn-primary"
						onclick={handleApply}
						disabled={busy}
					>
						Apply
					</button>
					<button type="button" class="btn btn-ghost" onclick={handleCancel} disabled={busy}>
						Cancel
					</button>
				{/if}
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleGenerate}
					disabled={busy || !prompt.trim()}
				>
					{#if busy}
						<span class="spinner" aria-hidden="true"></span>
						生成中…
					{:else}
						Generate
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.ai-curve-wrap {
		position: relative;
		display: inline-block;
	}
	.ai-btn {
		padding: 2px 8px;
		font-size: 0.66rem;
		font-weight: 700;
		font-family: var(--font-sans);
		background: rgba(232, 168, 76, 0.12);
		color: var(--accent-primary);
		border: 1px solid rgba(232, 168, 76, 0.35);
		border-radius: var(--radius-sm);
		cursor: pointer;
		height: 22px;
		line-height: 1;
	}
	.ai-btn:hover {
		background: rgba(232, 168, 76, 0.22);
	}
	.ai-btn--active {
		background: rgba(232, 168, 76, 0.26);
	}
	.popover {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		width: 280px;
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-elevated);
		padding: var(--space-sm);
		z-index: var(--z-popover);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.title {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.1rem;
		cursor: pointer;
		line-height: 1;
		padding: 0 4px;
	}
	.close:hover {
		color: var(--text-primary);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.field-label {
		font-size: 0.65rem;
		color: var(--text-muted);
	}
	.prompt-input {
		width: 100%;
		padding: 6px 8px;
		font-family: var(--font-sans);
		font-size: 0.76rem;
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		resize: vertical;
	}
	.prompt-input:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
	}
	.range-row {
		display: flex;
		gap: var(--space-sm);
	}
	.range-field {
		flex: 1;
	}
	.range-field input {
		padding: 4px 6px;
		font-size: 0.76rem;
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}
	.range-field input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}
	.err {
		font-size: 0.7rem;
		color: var(--error);
	}
	.actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
	.btn {
		padding: 5px 12px;
		font-size: 0.72rem;
		font-weight: 600;
		border-radius: var(--radius-sm);
		cursor: pointer;
		border: 1px solid transparent;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.btn-primary {
		background: var(--accent-primary);
		color: #fff;
	}
	.btn-primary:hover:not(:disabled) {
		background: #d09440;
	}
	.btn-ghost {
		background: var(--bg-elevated);
		color: var(--text-primary);
		border-color: var(--border-default);
	}
	.btn-ghost:hover:not(:disabled) {
		background: var(--bg-hover);
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.spinner {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 2px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>