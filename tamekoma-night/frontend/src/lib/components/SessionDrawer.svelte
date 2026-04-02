<script lang="ts">
	import type { SaveHistory, Comment } from '$lib/api';

	interface Props {
		history: SaveHistory[];
		open: boolean;
		onClose: () => void;
		comments: Comment[];
		onAddComment: (text: string) => void;
		onDeleteComment: (commentId: string) => void;
		onRestoreVersion?: (score: string) => void;
		currentUserId: string;
		currentScore?: string;
	}

	let {
		history,
		open,
		onClose,
		comments = [],
		onAddComment,
		onDeleteComment,
		onRestoreVersion,
		currentUserId = '',
		currentScore = '',
	}: Props = $props();

	let commentText = $state('');
	let timelineEl: HTMLDivElement | undefined = $state();
	let previewVersion = $state<SaveHistory | null>(null);

	const computeDiff = (oldScore: string, newScore: string): { kind: 'same' | 'add' | 'del'; text: string }[] => {
		const oldLines = oldScore.split('\n');
		const newLines = newScore.split('\n');
		const result: { kind: 'same' | 'add' | 'del'; text: string }[] = [];
		const max = Math.max(oldLines.length, newLines.length);
		for (let i = 0; i < max; i++) {
			const o = oldLines[i];
			const n = newLines[i];
			if (o === n) {
				result.push({ kind: 'same', text: o ?? '' });
			} else {
				if (o !== undefined) result.push({ kind: 'del', text: o });
				if (n !== undefined) result.push({ kind: 'add', text: n });
			}
		}
		return result;
	};

	const handleSendComment = () => {
		const text = commentText.trim();
		if (!text) return;
		onAddComment(text);
		commentText = '';
	};

	// Merge history + comments into unified timeline
	type TimelineItem =
		| { kind: 'save'; data: SaveHistory; time: number }
		| { kind: 'comment'; data: Comment; time: number };

	const timeline = $derived.by(() => {
		const items: TimelineItem[] = [];
		for (const h of history) {
			if (h.comment) {
				items.push({ kind: 'save', data: h, time: new Date(h.createdAt).getTime() });
			}
		}
		for (const c of comments) {
			items.push({ kind: 'comment', data: c, time: new Date(c.createdAt).getTime() });
		}
		return items.sort((a, b) => a.time - b.time);
	});

	const totalCount = $derived(timeline.length);

	// Auto-scroll to bottom
	$effect(() => {
		if (timeline && timelineEl) {
			requestAnimationFrame(() => {
				timelineEl!.scrollTop = timelineEl!.scrollHeight;
			});
		}
	});

	const avatarColor = (name: string): string => {
		const colors = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#f87171', '#38bdf8', '#a3e635'];
		let hash = 0;
		for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
		return colors[Math.abs(hash) % colors.length];
	};

	const initials = (name: string): string =>
		name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

	const countBars = (score: string): number => {
		if (!score) return 0;
		return (score.match(/\|/g) || []).length;
	};

	// Build a map from save history index to bar diff vs previous save
	const saveDiffs = $derived.by(() => {
		const diffs = new Map<number, number>();
		const saves = history.filter(h => h.comment || h.score);
		for (let i = 1; i < saves.length; i++) {
			const prevBars = countBars(saves[i - 1].score);
			const currBars = countBars(saves[i].score);
			const diff = currBars - prevBars;
			diffs.set(i, diff);
		}
		return { saves, diffs };
	});

	const getDiffForSave = (s: SaveHistory): number | null => {
		const idx = saveDiffs.saves.indexOf(s);
		if (idx <= 0) return null;
		return saveDiffs.diffs.get(idx) ?? null;
	};

	const relativeTime = (dateStr: string): string => {
		try {
			const d = new Date(dateStr);
			const diff = Date.now() - d.getTime();
			const mins = Math.floor(diff / 60000);
			if (mins < 1) return 'たった今';
			if (mins < 60) return `${mins}分前`;
			const hours = Math.floor(mins / 60);
			if (hours < 24) return `${hours}時間前`;
			const days = Math.floor(hours / 24);
			if (days < 7) return `${days}日前`;
			return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
		} catch { return dateStr; }
	};
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if open}
	<div class="drawer-overlay" onclick={onClose}></div>
{/if}
<div class="drawer" class:drawer--open={open}>
	<div class="drawer-header">
		<h2>アクティビティ</h2>
		<span class="count">{totalCount}</span>
		<button class="drawer-close" onclick={onClose} title="閉じる">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="3" y1="3" x2="13" y2="13" />
				<line x1="13" y1="3" x2="3" y2="13" />
			</svg>
		</button>
	</div>

	<div class="timeline" bind:this={timelineEl}>
		{#each timeline as item}
			{#if item.kind === 'save'}
				{@const s = item.data}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="tl-item tl-save tl-save--clickable" class:tl-save--selected={previewVersion === s} onclick={() => { previewVersion = previewVersion === s ? null : s; }}>
					<div class="tl-avatar" style="background: {avatarColor(s.userName)}">
						{initials(s.userName)}
					</div>
					<div class="tl-body">
						<div class="tl-meta">
							<span class="tl-name">{s.userName}</span>
							<span class="tl-action">が保存</span>
							<span class="tl-time">{relativeTime(s.createdAt)}</span>
						</div>
						{#if s.comment}
							<div class="tl-text">{s.comment}</div>
						{/if}
						{#if getDiffForSave(s) !== null && getDiffForSave(s) !== 0}
							<div class="tl-diff" class:tl-diff--add={(getDiffForSave(s) ?? 0) > 0} class:tl-diff--remove={(getDiffForSave(s) ?? 0) < 0}>
								{(getDiffForSave(s) ?? 0) > 0 ? `コード追加: +${getDiffForSave(s)}` : `コード削除: ${getDiffForSave(s)}`}
							</div>
						{/if}
					</div>
				</div>
				{#if previewVersion === s}
					<div class="version-preview">
						<div class="version-diff">
							{#each computeDiff(s.score, currentScore) as line}
								<div class="diff-line" class:diff-add={line.kind === 'add'} class:diff-del={line.kind === 'del'}>
									<span class="diff-marker">{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}</span>
									<span class="diff-text">{line.text || '\u00A0'}</span>
								</div>
							{/each}
						</div>
						{#if onRestoreVersion}
							<button class="btn-restore" onclick={() => { onRestoreVersion(s.score); previewVersion = null; }}>
								この版を復元
							</button>
						{/if}
					</div>
				{/if}
			{:else}
				{@const c = item.data}
				<div class="tl-item tl-comment">
					<div class="tl-avatar" style="background: {avatarColor(c.userName)}">
						{initials(c.userName)}
					</div>
					<div class="tl-body">
						<div class="tl-meta">
							<span class="tl-name">{c.userName}</span>
							<span class="tl-time">{relativeTime(c.createdAt)}</span>
							{#if c.userId === currentUserId}
								<button class="tl-delete" onclick={() => onDeleteComment(c.id)} title="削除">×</button>
							{/if}
						</div>
						{#if c.anchorSnapshot}
							<pre class="tl-snapshot">{c.anchorSnapshot}</pre>
						{/if}
						<div class="tl-text">{c.text}</div>
					</div>
				</div>
			{/if}
		{/each}

		{#if timeline.length === 0}
			<div class="tl-empty">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				<p>まだアクティビティがありません</p>
				<p class="tl-empty-sub">保存やコメントがここに表示されます</p>
			</div>
		{/if}
	</div>

	<div class="drawer-input">
		<textarea
			class="comment-input"
			bind:value={commentText}
			placeholder="コメントを入力..."
			rows="2"
			onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); handleSendComment(); } }}
		></textarea>
		<button class="btn-send" onclick={handleSendComment} disabled={!commentText.trim()}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<line x1="22" y1="2" x2="11" y2="13" />
				<polygon points="22 2 15 22 11 13 2 9 22 2" />
			</svg>
		</button>
	</div>
</div>

<style>
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
		width: 480px;
		max-width: 92vw;
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
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		flex: 1;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.12);
		padding: 2px 7px;
		border-radius: 8px;
	}

	.drawer-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.drawer-close:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--accent-primary); }

	/* Timeline */
	.timeline {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tl-item {
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		transition: background 0.1s;
	}

	.tl-item:hover { background: rgba(255,255,255,0.02); }

	.tl-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.55rem;
		font-weight: 700;
		color: #fff;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.tl-body {
		flex: 1;
		min-width: 0;
	}

	.tl-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}

	.tl-name {
		font-weight: 600;
		color: var(--text-secondary);
		font-size: 0.78rem;
	}

	.tl-action {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.tl-time {
		font-size: 0.65rem;
		color: var(--text-muted);
		opacity: 0.6;
		margin-left: auto;
	}

	.tl-text {
		font-size: 0.8rem;
		color: var(--text-primary);
		margin-top: 2px;
		line-height: 1.5;
	}

	.tl-snapshot {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-muted);
		background: var(--bg-surface);
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		margin: 4px 0 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tl-save {
		opacity: 0.6;
	}

	.tl-diff {
		font-size: 0.65rem;
		font-family: var(--font-mono);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		margin-top: 2px;
		display: inline-block;
	}

	.tl-diff--add {
		color: rgb(34, 197, 94);
		background: rgba(34, 197, 94, 0.1);
	}

	.tl-diff--remove {
		color: rgb(249, 115, 22);
		background: rgba(249, 115, 22, 0.1);
	}

	.tl-save--clickable {
		cursor: pointer;
		border-radius: var(--radius-md);
	}

	.tl-save--clickable:hover {
		opacity: 0.85;
		background: rgba(167, 139, 250, 0.06);
	}

	.tl-save--selected {
		opacity: 1;
		background: rgba(167, 139, 250, 0.08);
		border-left: 2px solid var(--accent-primary);
	}

	.version-preview {
		margin: 0 var(--space-md) var(--space-sm);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.version-diff {
		max-height: 200px;
		overflow-y: auto;
		padding: var(--space-xs) 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.6;
	}

	.diff-line {
		display: flex;
		padding: 0 var(--space-sm);
	}

	.diff-marker {
		width: 16px;
		flex-shrink: 0;
		color: var(--text-muted);
		user-select: none;
	}

	.diff-text {
		white-space: pre-wrap;
		word-break: break-all;
	}

	.diff-add {
		background: rgba(34, 197, 94, 0.1);
		color: rgb(74, 222, 128);
	}

	.diff-add .diff-marker { color: rgb(34, 197, 94); }

	.diff-del {
		background: rgba(248, 113, 113, 0.1);
		color: rgb(252, 165, 165);
		text-decoration: line-through;
		opacity: 0.7;
	}

	.diff-del .diff-marker { color: rgb(248, 113, 113); }

	.btn-restore {
		display: block;
		width: 100%;
		padding: var(--space-sm);
		border: none;
		border-top: 1px solid var(--border-subtle);
		background: rgba(167, 139, 250, 0.06);
		color: var(--accent-primary);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-restore:hover {
		background: rgba(167, 139, 250, 0.15);
	}

	.tl-delete {
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		padding: 0 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.tl-item:hover .tl-delete { opacity: 1; }
	.tl-delete:hover { color: var(--error); }

	.tl-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl);
		color: var(--text-muted);
		font-size: 0.85rem;
		gap: var(--space-sm);
	}

	.tl-empty p { margin: 0; }

	.tl-empty-sub {
		font-size: 0.72rem;
		opacity: 0.6;
	}

	/* Input */
	.drawer-input {
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-md);
		border-top: 1px solid var(--border-subtle);
		background: var(--bg-surface);
		align-items: flex-end;
	}

	.comment-input {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.8rem;
		resize: none;
		box-sizing: border-box;
	}

	.comment-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.comment-input::placeholder { color: var(--text-muted); opacity: 0.5; }

	.btn-send {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.15s;
	}

	.btn-send:hover:not(:disabled) { background: var(--accent-secondary); }
	.btn-send:disabled { opacity: 0.3; cursor: default; }

	@media (max-width: 600px) {
		.drawer { width: 100vw; max-width: 100vw; }
	}
</style>
