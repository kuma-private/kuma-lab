<script lang="ts">
	import type { Thread } from '$lib/api';

	interface Props {
		thread: Thread;
		logCount: number;
		statusLabel: string;
		statusType: string;
		isMyTurnGlow: boolean;
		canAct: boolean;
		isPlayer: boolean;
		isOpponentFinishProposal: boolean;
		opponentName: string;
		drawerOpen: boolean;
		error: string | null;
		onOpenLog: () => void;
		onProposeFinish: () => void;
		onExport: () => void;
		onJoin: () => void;
		onAcceptFinish: () => void;
		onRejectFinish: () => void;
	}

	let {
		thread,
		logCount,
		statusLabel,
		statusType,
		isMyTurnGlow,
		canAct,
		isPlayer,
		isOpponentFinishProposal,
		opponentName,
		drawerOpen,
		error,
		onOpenLog,
		onProposeFinish,
		onExport,
		onJoin,
		onAcceptFinish,
		onRejectFinish,
	}: Props = $props();
</script>

<header class="thread-header">
	<a href="/" class="back-link">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="10,2 4,8 10,14" />
		</svg>
		戻る
	</a>
	<div class="thread-info">
		<h1 class="thread-title">{thread.title}</h1>
		<div class="thread-meta">
			<span class="badge">Key: {thread.key}</span>
			<span class="badge">{thread.timeSignature}</span>
			<span class="badge">BPM {thread.bpm}</span>
			<span class="badge badge-turn">Turn {thread.turnCount}</span>
		</div>
	</div>
	<div class="header-actions">
		<button class="btn-log" onclick={onOpenLog} title="セッションログ">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
			ログ
			{#if logCount > 0}
				<span class="log-badge">{logCount}</span>
			{/if}
		</button>
		{#if canAct}
			<button class="btn-propose" onclick={onProposeFinish} title="Propose to finish">
				完成を提案
			</button>
		{/if}
		<button class="btn btn-ghost" onclick={onExport}>エクスポート</button>
	</div>
</header>

<!-- Status bar -->
<div class="status-bar status-{statusType}" class:status-glow={isMyTurnGlow}>
	<div class="status-left">
		{#if isMyTurnGlow}
			<svg class="status-note" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
			</svg>
		{/if}
		<span class="status-label">{statusLabel}</span>
	</div>
	<span class="status-players">
		{thread.createdByName} vs {thread.opponentName || '???'}
	</span>
</div>

<!-- Join button for invited player -->
{#if thread.status === 'waiting' && !isPlayer}
	<div class="join-section">
		<button class="btn btn-primary" onclick={onJoin}>このセッションに参加!</button>
	</div>
{/if}

<!-- Finish proposal response (inline when drawer closed) -->
{#if isOpponentFinishProposal && isPlayer && !drawerOpen}
	<div class="finish-response">
		<span class="finish-text">@{opponentName} がスコアの完成を提案しています。終了しますか?</span>
		<div class="finish-buttons">
			<button class="btn btn-primary btn-sm" onclick={onAcceptFinish}>承認</button>
			<button class="btn btn-secondary btn-sm" onclick={onRejectFinish}>却下</button>
		</div>
	</div>
{/if}

{#if error}
	<div class="error-banner">{error}</div>
{/if}

<style>
	/* Header */
	.thread-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-lg);
		padding-bottom: var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-lg);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-decoration: none;
		flex-shrink: 0;
		padding-top: 4px;
	}

	.thread-info { flex: 1; }

	.thread-title {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 8px;
	}

	.thread-meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.badge-turn {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
	}

	.header-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		flex-shrink: 0;
	}

	/* Log button */
	.btn-log {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		position: relative;
	}

	.btn-log:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.1);
	}

	.log-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 9px;
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1;
	}

	.btn-propose {
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-propose:hover {
		border-color: var(--accent-warm);
		color: var(--accent-warm);
	}

	/* Status bar */
	.status-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-lg);
		font-size: 0.85rem;
		transition: all 0.3s ease;
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.status-myturn {
		background: rgba(167, 139, 250, 0.15);
		border: 1px solid var(--accent-primary);
		color: var(--accent-primary);
	}

	.status-glow {
		box-shadow: 0 0 20px rgba(167, 139, 250, 0.3), 0 0 40px rgba(167, 139, 250, 0.1);
		animation: glow-pulse 2s ease-in-out infinite;
	}

	@keyframes glow-pulse {
		0%, 100% { box-shadow: 0 0 20px rgba(167, 139, 250, 0.3), 0 0 40px rgba(167, 139, 250, 0.1); }
		50% { box-shadow: 0 0 30px rgba(167, 139, 250, 0.5), 0 0 60px rgba(167, 139, 250, 0.2); }
	}

	.status-note {
		animation: note-bounce 1.5s ease-in-out infinite;
		flex-shrink: 0;
	}

	@keyframes note-bounce {
		0%, 100% { transform: translateY(0) rotate(0deg); }
		25% { transform: translateY(-2px) rotate(-5deg); }
		75% { transform: translateY(1px) rotate(3deg); }
	}

	.status-waiting {
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
	}

	.status-completed {
		background: linear-gradient(135deg, rgba(52, 211, 153, 0.1), rgba(167, 139, 250, 0.08));
		border: 1px solid var(--success);
		color: var(--success);
	}

	.status-label { font-weight: 600; }
	.status-players { font-size: 0.8rem; color: var(--text-muted); }

	.join-section {
		text-align: center;
		padding: var(--space-lg);
	}

	/* Finish response (inline) */
	.finish-response {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-lg);
		padding: var(--space-md) var(--space-lg);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-lg);
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid rgba(251, 191, 36, 0.3);
	}

	.finish-text {
		color: var(--accent-warm);
		font-weight: 500;
		font-size: 0.85rem;
	}

	.finish-buttons {
		display: flex;
		gap: var(--space-xs);
	}

	.btn-sm {
		padding: 4px 12px;
		font-size: 0.8rem;
	}

	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
		margin-bottom: var(--space-md);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.thread-header {
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		.header-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
