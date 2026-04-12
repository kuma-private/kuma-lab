<script lang="ts">
	import type { Song } from '$lib/types/song';
	import { suggestMixer } from '$lib/api';
	import { songStore } from '$lib/stores/song.svelte';
	import ChatMessage from './ChatMessage.svelte';
	import type { ChatMessage as MsgType } from './ChatMessage.svelte';
	import { extractMixerSnapshot } from './plugin-descriptors';

	let { song }: { song: Song } = $props();

	let history = $state<MsgType[]>([]);
	let input = $state('');
	let busy = $state(false);

	function pushMessage(msg: MsgType) {
		history = [...history, msg];
	}

	function replaceLast(msg: MsgType) {
		history = [...history.slice(0, -1), msg];
	}

	async function handleSend() {
		const text = input.trim();
		if (!text || busy) return;

		pushMessage({ id: crypto.randomUUID(), role: 'user', text });
		input = '';
		busy = true;
		pushMessage({ id: crypto.randomUUID(), role: 'loading' });

		try {
			const snapshot = extractMixerSnapshot(song);
			const res = await suggestMixer({
				songId: song.id,
				prompt: text,
				mixer: snapshot
			});
			replaceLast({
				id: crypto.randomUUID(),
				role: 'assistant',
				explanation: res.explanation,
				ops: res.ops ?? [],
				sideEffects: res.sideEffects ?? [],
				applied: false
			});
		} catch (e) {
			const err = e instanceof Error ? e.message : String(e);
			replaceLast({ id: crypto.randomUUID(), role: 'error', text: `エラー: ${err}` });
		} finally {
			busy = false;
		}
	}

	function handleApply(msgId: string) {
		const msg = history.find((m) => m.id === msgId);
		if (!msg || msg.role !== 'assistant') return;
		if (msg.ops.length === 0) return;
		songStore.applyPatch(msg.ops);
		history = history.map((m) =>
			m.id === msgId && m.role === 'assistant' ? { ...m, applied: true } : m
		);
	}

	function handleCancel(msgId: string) {
		// Dismiss the assistant message (keep in history but strip ops so apply disappears)
		history = history.map((m) =>
			m.id === msgId && m.role === 'assistant' ? { ...m, ops: [], applied: false } : m
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void handleSend();
		}
	}
</script>

<div class="chat">
	<div class="chat-head">
		<span class="title">Mixer AI</span>
		<span class="hint">自然言語でミキサーを編集</span>
	</div>

	<div class="history">
		{#if history.length === 0}
			<div class="empty">
				<p>例:</p>
				<ul>
					<li>"ピアノに軽いリバーブを追加して"</li>
					<li>"ベースを 2dB 下げて"</li>
					<li>"全体をウォームにしたい"</li>
				</ul>
			</div>
		{/if}
		{#each history as msg (msg.id)}
			<ChatMessage
				message={msg}
				onApply={() => handleApply(msg.id)}
				onCancel={() => handleCancel(msg.id)}
			/>
		{/each}
	</div>

	<div class="input-row">
		<textarea
			bind:value={input}
			onkeydown={handleKeydown}
			placeholder="ミキサーへの指示を入力... (Cmd/Ctrl+Enter で送信)"
			rows="2"
			disabled={busy}
			aria-label="プロンプト"
		></textarea>
		<button
			type="button"
			class="send"
			onclick={handleSend}
			disabled={busy || !input.trim()}
			aria-label="送信"
		>
			{busy ? '...' : 'Send'}
		</button>
	</div>
</div>

<style>
	.chat {
		display: flex;
		flex-direction: column;
		width: 360px;
		min-width: 300px;
		background: var(--bg-surface);
		border-left: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}
	.chat-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-bottom: 1px solid var(--border-subtle);
	}
	.title {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent-primary);
	}
	.hint {
		font-size: 0.68rem;
		color: var(--text-muted);
	}
	.history {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-sm) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.empty {
		color: var(--text-muted);
		font-size: 0.75rem;
	}
	.empty p {
		margin: 0 0 4px;
	}
	.empty ul {
		margin: 0;
		padding-left: 16px;
	}
	.empty li {
		margin: 2px 0;
	}
	.input-row {
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-top: 1px solid var(--border-subtle);
		align-items: flex-end;
	}
	textarea {
		flex: 1;
		resize: vertical;
		min-height: 48px;
		max-height: 200px;
		padding: 6px 10px;
		font-family: var(--font-sans);
		font-size: 0.78rem;
		background: var(--bg-base);
		color: var(--text-primary);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(232, 168, 76, 0.15);
	}
	.send {
		padding: 8px 14px;
		font-size: 0.78rem;
		font-weight: 600;
		background: var(--accent-primary);
		color: #fff;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		min-width: 58px;
	}
	.send:hover:not(:disabled) {
		background: #d09440;
	}
	.send:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
