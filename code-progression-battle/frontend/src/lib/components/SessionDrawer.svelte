<script lang="ts">
	import type { SaveHistory } from '$lib/api';

	type AiScores = { tension: number; creativity: number; coherence: number; surprise: number };

	const parseAiComment = (aiComment: string, aiScores: string): { comment: string; scores: AiScores | null } => {
		try {
			// Try to extract JSON from markdown code block or raw JSON
			const raw = aiComment;
			const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
			const jsonStr = jsonMatch ? jsonMatch[1] : raw;
			const parsed = JSON.parse(jsonStr);
			const scores = parsed.scores && typeof parsed.scores.tension === 'number' ? parsed.scores : null;
			return { comment: parsed.comment || raw, scores };
		} catch {
			// Try parsing aiScores separately
			let scores: AiScores | null = null;
			if (aiScores) {
				try {
					const s = JSON.parse(aiScores);
					if (typeof s.tension === 'number') scores = s;
				} catch {}
			}
			return { comment: aiComment, scores };
		}
	};

	interface Props {
		history: SaveHistory[];
		open: boolean;
		onClose: () => void;
		onRestore: (score: string) => void;
	}

	let {
		history,
		open,
		onClose,
		onRestore,
	}: Props = $props();

	let historyEl: HTMLDivElement | undefined = $state();

	// Auto-scroll history to bottom
	$effect(() => {
		if (history && historyEl) {
			requestAnimationFrame(() => {
				historyEl!.scrollTop = historyEl!.scrollHeight;
			});
		}
	});

	const avatarColor = (name: string): string => {
		const colors = [
			'#a78bfa', '#f472b6', '#34d399', '#60a5fa',
			'#fbbf24', '#f87171', '#38bdf8', '#a3e635'
		];
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
		return colors[Math.abs(hash) % colors.length];
	};

	const initials = (name: string): string => {
		return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
	};

	const formatTime = (dateStr: string): string => {
		try {
			return new Date(dateStr).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		} catch {
			return dateStr;
		}
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if open}
	<div class="drawer-overlay" onclick={onClose}></div>
{/if}
<div class="drawer" class:drawer--open={open}>
	<div class="drawer-header">
		<h2>保存履歴</h2>
		<span class="count">{history.length} 件</span>
		<button class="drawer-close" onclick={onClose} title="閉じる">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="3" x2="13" y2="13" />
				<line x1="13" y1="3" x2="3" y2="13" />
			</svg>
		</button>
	</div>

	<div class="history-timeline" bind:this={historyEl}>
		{#each history as item, i}
			<div class="post">
				<div class="post-header">
					<span class="post-number">#{i + 1}</span>
					<div class="post-avatar" style="background: {avatarColor(item.userName)}">
						{initials(item.userName)}
					</div>
					<span class="post-name">{item.userName}</span>
					{#if item.createdAt}
						<span class="post-time">{formatTime(item.createdAt)}</span>
					{/if}
				</div>
				{#if item.comment}
					<div class="post-comment">{item.comment}</div>
				{/if}
				{#if item.aiComment}
					{@const parsedAi = parseAiComment(item.aiComment, item.aiScores)}
					<div class="ai-comment">
						<span class="ai-icon">AI</span>
						<div class="ai-body">
							<span class="ai-text">{parsedAi.comment}</span>
							{#if parsedAi.scores}
								<div class="ai-scores">
									<span class="ai-score">緊張感 {parsedAi.scores.tension}/5</span>
									<span class="ai-score">独創性 {parsedAi.scores.creativity}/5</span>
									<span class="ai-score">整合性 {parsedAi.scores.coherence}/5</span>
									<span class="ai-score">意外性 {parsedAi.scores.surprise}/5</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}
				<div class="post-actions">
					<button class="btn-restore" onclick={() => { onRestore(item.score); onClose(); }}>
						このバージョンに戻す
					</button>
				</div>
			</div>
		{/each}

		{#if history.length === 0}
			<div class="empty-history">
				<div class="empty-icon">
					<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
						<path d="M9 18V5l12-2v13" />
						<circle cx="6" cy="18" r="3" />
						<circle cx="18" cy="16" r="3" />
					</svg>
				</div>
				<p class="empty-title">まだ保存履歴がありません</p>
				<p class="empty-sub">スコアを編集して保存しよう!</p>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Drawer */
	.drawer-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 59;
		animation: fade-in 0.2s ease;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.drawer {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		width: 400px;
		max-width: 90vw;
		background: var(--bg-base);
		border-left: 1px solid var(--border-subtle);
		z-index: 60;
		display: flex;
		flex-direction: column;
		transform: translateX(100%);
		transition: transform 0.3s ease;
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.3);
	}

	.drawer--open {
		transform: translateX(0);
	}

	.drawer-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-subtle);
		flex-shrink: 0;
	}

	.drawer-header h2 {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		flex: 1;
	}

	.count { font-size: 0.75rem; color: var(--text-muted); }

	.drawer-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.drawer-close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	/* History timeline */
	.history-timeline {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-md) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.post {
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		animation: post-in 0.25s ease-out;
		transition: background 0.15s;
	}

	.post:hover {
		background: rgba(167, 139, 250, 0.03);
	}

	@keyframes post-in {
		from { opacity: 0; transform: translateY(6px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.post-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-sm);
		flex-wrap: wrap;
	}

	.post-number {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--accent-primary);
		font-weight: 700;
		min-width: 24px;
	}

	.post-avatar {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.55rem;
		font-weight: 700;
		color: #fff;
		flex-shrink: 0;
	}

	.post-name {
		font-weight: 600;
		color: var(--text-secondary);
		font-size: 0.78rem;
	}

	.post-time {
		margin-left: auto;
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.6;
		font-family: var(--font-mono);
	}

	.post-comment {
		color: var(--text-muted);
		font-size: 0.78rem;
		margin: var(--space-sm) 0 0 30px;
		padding-left: var(--space-sm);
		border-left: 2px solid var(--border-default);
	}

	.post-actions {
		margin: var(--space-sm) 0 0 30px;
	}

	.btn-restore {
		padding: 3px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-restore:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	/* AI comment bubble */
	.ai-comment {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		margin: var(--space-sm) 0 0 30px;
		padding: var(--space-sm) var(--space-md);
		background: rgba(96, 165, 250, 0.08);
		border-radius: 6px;
		border-left: 2px solid rgba(96, 165, 250, 0.3);
	}

	.ai-icon {
		font-size: 0.6rem;
		font-weight: 700;
		color: rgba(96, 165, 250, 0.8);
		background: rgba(96, 165, 250, 0.15);
		padding: 1px 4px;
		border-radius: 3px;
		flex-shrink: 0;
		line-height: 1.4;
	}

	.ai-body {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ai-text {
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.ai-scores {
		display: flex;
		gap: 6px;
	}

	.ai-score {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-style: normal;
		font-weight: 600;
		color: rgba(96, 165, 250, 0.7);
		background: rgba(96, 165, 250, 0.08);
		padding: 1px 5px;
		border-radius: 3px;
	}

	.empty-history {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl) var(--space-md);
		color: var(--text-muted);
		gap: 4px;
	}

	.empty-icon {
		opacity: 0.25;
		margin-bottom: var(--space-sm);
	}

	.empty-title {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-secondary);
	}

	.empty-sub {
		font-size: 0.8rem;
		margin: 0;
	}

	@media (max-width: 600px) {
		.drawer {
			width: 100vw;
			max-width: 100vw;
		}
	}
</style>
