<script lang="ts">
	import type { JsonPatchOp } from '$lib/bridge/protocol';

	export type ChatMessage =
		| { id: string; role: 'user'; text: string }
		| { id: string; role: 'assistant'; explanation: string; ops: JsonPatchOp[]; sideEffects: string[]; applied: boolean }
		| { id: string; role: 'loading' }
		| { id: string; role: 'error'; text: string };

	let {
		message,
		onApply,
		onCancel
	}: {
		message: ChatMessage;
		onApply?: () => void;
		onCancel?: () => void;
	} = $props();

	function summarizeOp(op: JsonPatchOp): string {
		if (op.op === 'add') return `add ${op.path}`;
		if (op.op === 'remove') return `remove ${op.path}`;
		return `replace ${op.path} = ${JSON.stringify(op.value)}`;
	}
</script>

{#if message.role === 'user'}
	<div class="msg user">
		<div class="bubble">{message.text}</div>
	</div>
{:else if message.role === 'loading'}
	<div class="msg assistant">
		<div class="bubble loading">
			<span class="spinner"></span>
			考え中...
		</div>
	</div>
{:else if message.role === 'error'}
	<div class="msg assistant">
		<div class="bubble error">{message.text}</div>
	</div>
{:else if message.role === 'assistant'}
	<div class="msg assistant">
		<div class="bubble">
			<p class="explanation">{message.explanation}</p>
			{#if message.sideEffects.length > 0}
				<ul class="side-effects">
					{#each message.sideEffects as s, i (i)}
						<li>{s}</li>
					{/each}
				</ul>
			{/if}
			{#if message.ops.length > 0}
				<details class="ops">
					<summary>{message.ops.length} 件の変更</summary>
					<ul>
						{#each message.ops as op, i (i)}
							<li><code>{summarizeOp(op)}</code></li>
						{/each}
					</ul>
				</details>
				{#if !message.applied}
					<div class="actions">
						<button type="button" class="apply" onclick={onApply}>Apply</button>
						<button type="button" class="cancel" onclick={onCancel}>Cancel</button>
					</div>
				{:else}
					<div class="applied-tag">適用済み</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.msg {
		display: flex;
		padding: var(--space-xs) 0;
	}
	.msg.user {
		justify-content: flex-end;
	}
	.msg.assistant {
		justify-content: flex-start;
	}
	.bubble {
		max-width: 88%;
		padding: 8px 12px;
		border-radius: var(--radius-md);
		font-size: 0.78rem;
		line-height: 1.4;
	}
	.msg.user .bubble {
		background: rgba(110, 168, 208, 0.15);
		border: 1px solid rgba(110, 168, 208, 0.3);
		color: var(--text-primary);
	}
	.msg.assistant .bubble {
		background: var(--bg-elevated);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
	}
	.bubble.error {
		border-color: var(--error);
		color: var(--error);
	}
	.bubble.loading {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
	}
	.spinner {
		display: inline-block;
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.explanation {
		margin: 0;
		white-space: pre-wrap;
	}
	.side-effects {
		margin: 6px 0 0;
		padding-left: 18px;
		color: var(--accent-warm);
		font-size: 0.72rem;
	}
	.ops {
		margin-top: 8px;
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.ops summary {
		cursor: pointer;
	}
	.ops code {
		font-family: var(--font-mono);
		font-size: 0.66rem;
	}
	.ops ul {
		margin: 4px 0 0;
		padding-left: 16px;
	}
	.actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}
	.apply {
		padding: 4px 12px;
		font-size: 0.72rem;
		font-weight: 600;
		background: var(--accent-primary);
		color: #fff;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.apply:hover {
		background: #d09440;
	}
	.cancel {
		padding: 4px 12px;
		font-size: 0.72rem;
		font-weight: 600;
		background: var(--bg-base);
		color: var(--text-secondary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.cancel:hover {
		background: var(--bg-hover);
	}
	.applied-tag {
		margin-top: 8px;
		font-size: 0.68rem;
		color: var(--text-muted);
		font-style: italic;
	}
</style>
