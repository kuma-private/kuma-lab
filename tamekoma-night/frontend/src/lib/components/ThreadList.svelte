<script lang="ts">
	import type { Thread } from '$lib/api';
	import { extractRoot } from '$lib/chord-parser';
	import { showToast } from '$lib/stores/toast.svelte';

	interface Props {
		threads: Thread[];
		filter: string;
		onFilterChange: (filter: string) => void;
		onCreate?: () => void;
	}

	let { threads, filter = 'all', onFilterChange = () => {}, onCreate }: Props = $props();

	// Favorites (client-side only, persisted in localStorage)
	let favorites = $state<Set<string>>(new Set());

	$effect(() => {
		try {
			const stored = localStorage.getItem('favorites');
			if (stored) favorites = new Set(JSON.parse(stored));
		} catch { /* ignore */ }
	});

	const toggleFavorite = (e: Event, threadId: string) => {
		e.preventDefault();
		e.stopPropagation();
		const next = new Set(favorites);
		if (next.has(threadId)) next.delete(threadId);
		else next.add(threadId);
		favorites = next;
		try { localStorage.setItem('favorites', JSON.stringify([...next])); } catch { /* ignore */ }
	};

	const displayedThreads = $derived.by(() => {
		if (filter === 'favorites') return threads.filter(t => favorites.has(t.id));
		return threads;
	});

	const handleCopyScore = async (e: Event, thread: Thread) => {
		e.preventDefault();
		e.stopPropagation();
		if (!thread.score) {
			showToast('スコアが空です', 'error');
			return;
		}
		try {
			await navigator.clipboard.writeText(thread.score);
			showToast('コピーしました', 'success');
		} catch {
			showToast('コピーに失敗しました', 'error');
		}
	};

	const formatDate = (iso: string): string => {
		try {
			const d = new Date(iso);
			const now = new Date();
			const diff = now.getTime() - d.getTime();
			const mins = Math.floor(diff / 60000);
			if (mins < 1) return 'たった今';
			if (mins < 60) return `${mins}分前`;
			const hours = Math.floor(mins / 60);
			if (hours < 24) return `${hours}時間前`;
			const days = Math.floor(hours / 24);
			if (days < 7) return `${days}日前`;
			return `${d.getMonth() + 1}/${d.getDate()}`;
		} catch {
			return '';
		}
	};

	const KEY_COLORS: Record<string, string> = {
		'C': '#f87171', 'C#': '#fb923c', 'Db': '#fb923c',
		'D': '#fbbf24', 'D#': '#a3e635', 'Eb': '#a3e635',
		'E': '#34d399', 'F': '#2dd4bf',
		'F#': '#22d3ee', 'Gb': '#22d3ee',
		'G': '#60a5fa', 'G#': '#818cf8', 'Ab': '#818cf8',
		'A': '#e8a84c', 'A#': '#c084fc', 'Bb': '#c084fc',
		'B': '#f472b6',
	};

	const keyColor = (key: string): string => KEY_COLORS[key.split(' ')[0]] || '#e8a84c';

	const keyShort = (key: string): string => key.replace(' Major', '').replace(' Minor', 'm');

	const previewChords = (score: string): string[] => {
		if (!score) return [];
		const chords: string[] = [];
		const tokens = score.replace(/\/\/.*$/gm, '').split(/[\|\n]+/);
		for (const seg of tokens) {
			for (const token of seg.trim().split(/\s+/)) {
				if (!token || token === '-' || token === '_' || token === '=' || token === '%') continue;
				try {
					extractRoot(token);
					chords.push(token);
					if (chords.length >= 8) return chords;
				} catch {}
			}
		}
		return chords;
	};
</script>

<div class="filter-bar">
	<button class="filter-tab" class:filter-tab--active={filter === 'all'} onclick={() => onFilterChange('all')}>すべて</button>
	<button class="filter-tab" class:filter-tab--active={filter === 'mine'} onclick={() => onFilterChange('mine')}>自分の</button>
	<button class="filter-tab" class:filter-tab--active={filter === 'shared'} onclick={() => onFilterChange('shared')}>共有</button>
	<button class="filter-tab" class:filter-tab--active={filter === 'favorites'} onclick={() => onFilterChange('favorites')}>
		<span class="filter-star">&#9733;</span> お気に入り
	</button>
</div>

{#if displayedThreads.length === 0}
	<div class="empty">
		<div class="empty-chords" aria-hidden="true">| Cmaj7 | Dm7 | G7 | Cmaj7 |</div>
		<p class="empty-title">まだスコアがありません</p>
		<p class="empty-sub">新規作成してコードを放とう</p>
		{#if onCreate}
			<button class="empty-cta" onclick={onCreate}>
				コードを書き始める
			</button>
		{/if}
	</div>
{:else}
	<div class="grid">
		{#each displayedThreads as thread, i}
			{@const chords = previewChords(thread.score)}
			{@const color = keyColor(thread.key)}
			<a
				href={thread.editorMode === 'pianoroll' ? `/thread/${thread.id}/pianoroll` : `/thread/${thread.id}`}
				class="card"
				style="animation-delay: {Math.min(i * 0.04, 0.6)}s"
				aria-label="{thread.title} - {thread.key} {thread.bpm}BPM"
			>
				<div class="card-accent" style="background: linear-gradient(90deg, {color}, {color}00)"></div>

				<div class="card-body">
					<h3 class="card-title">{thread.title}</h3>

					{#if chords.length > 0}
						<div class="card-chords">
							{#each chords as chord}
								<span class="chord-tag">{chord}</span>
							{/each}
						</div>
					{/if}

					<div class="card-meta">
						<span class="pill pill--key" style="color: {color}; border-color: {color}40">{keyShort(thread.key)}</span>
						<span class="pill">{thread.bpm} BPM</span>
						{#if (thread.members?.length ?? 0) > 0}
							<span class="pill pill--members">{thread.members.length}人</span>
						{/if}
					</div>

					<div class="card-footer">
						<span class="card-author">{thread.createdByName}</span>
						<span class="card-footer-right">
							<span class="card-visibility" title={thread.visibility === 'public' ? '公開' : thread.visibility === 'shared' ? '共有' : '非公開'}>{thread.visibility === 'public' ? '🌐' : thread.visibility === 'shared' ? '👥' : '🔒'}</span>
							<span class="card-time">{formatDate(thread.lastEditedAt)}</span>
						</span>
					</div>

					<div class="card-actions">
						<button
							class="card-action card-action--fav"
							class:card-action--fav-active={favorites.has(thread.id)}
							title={favorites.has(thread.id) ? 'お気に入り解除' : 'お気に入り'}
							onclick={(e) => toggleFavorite(e, thread.id)}
						>
							<span class="fav-star">{favorites.has(thread.id) ? '★' : '☆'}</span>
						</button>
						<button class="card-action" title="スコアをコピー" onclick={(e) => handleCopyScore(e, thread)}>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
							</svg>
							<span class="action-label">コピー</span>
						</button>
						<button
							class="card-action card-action--pianoroll"
							title="ピアノロールで開く"
							onclick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/thread/${thread.id}/pianoroll`; }}
						>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="2" y="4" width="20" height="3" rx="1" />
								<rect x="6" y="10" width="12" height="3" rx="1" />
								<rect x="4" y="16" width="16" height="3" rx="1" />
							</svg>
							<span class="action-label">ピアノロール</span>
						</button>
					</div>
				</div>
			</a>
		{/each}
	</div>
{/if}

<style>
	/* Filter bar */
	.filter-bar {
		display: flex;
		gap: 4px;
		margin-bottom: var(--space-md);
	}

	.filter-tab {
		padding: 4px 14px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.filter-tab:hover {
		color: var(--text-secondary);
		border-color: var(--border-default);
	}

	.filter-tab--active {
		color: var(--accent-primary);
		border-color: var(--accent-primary);
		background: rgba(232, 168, 76, 0.08);
	}

	/* Empty state */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 80px var(--space-md);
		gap: 8px;
	}

	.empty-chords {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--text-muted);
		opacity: 0.15;
		margin-bottom: var(--space-md);
		letter-spacing: 0.05em;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-secondary);
		margin: 0;
	}

	.empty-sub {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0;
	}

	.empty-cta {
		margin-top: var(--space-lg);
		padding: 10px 28px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.88rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.empty-cta:hover {
		background: #d09440;
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(232, 168, 76, 0.35);
	}

	/* Grid */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-md);
	}

	/* Card */
	.card {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-lg);
		background: var(--bg-surface);
		overflow: hidden;
		transition: all 0.2s ease;
		position: relative;
		animation: card-in 0.35s ease both;
		border: 1px solid var(--border-subtle);
	}

	@keyframes card-in {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(232, 168, 76, 0.1), 0 8px 24px rgba(0, 0, 0, 0.35);
		border-color: var(--accent-primary);
	}

	.card:focus-visible {
		outline: 2px solid var(--accent-primary);
		outline-offset: 2px;
	}

	.card-accent {
		height: 3px;
		flex-shrink: 0;
		opacity: 0.8;
	}

	.card-body {
		padding: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
	}

	.card-title {
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Chord preview */
	.card-chords {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.chord-tag {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--text-muted);
		background: var(--bg-base);
		padding: 2px 5px;
		border-radius: 3px;
	}

	/* Meta pills */
	.card-meta {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.pill {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-muted);
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--bg-base);
	}

	.pill--key {
		border: 1px solid;
		background: transparent;
		font-weight: 600;
	}

	.pill--members {
		color: var(--success);
		background: rgba(52, 211, 153, 0.08);
	}

	/* Footer */
	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: auto;
		padding-top: 4px;
	}

	.card-author {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.card-footer-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.card-visibility {
		font-size: 0.7rem;
		opacity: 0.5;
	}

	.card-time {
		font-size: 0.65rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	/* Quick actions */
	.card-actions {
		display: flex;
		gap: 4px;
		padding-top: 6px;
		border-top: 1px solid var(--border-subtle);
		margin-top: 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.card:hover .card-actions {
		opacity: 1;
	}

	.card-action {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.65rem;
		cursor: pointer;
		transition: all 0.15s;
		text-decoration: none;
	}

	.card-action:hover {
		color: var(--accent-primary);
		border-color: var(--accent-primary);
		background: rgba(232, 168, 76, 0.08);
	}

	.action-label {
		pointer-events: none;
	}

	.filter-star {
		color: var(--accent-warm);
		font-size: 0.72rem;
	}

	.card-action--fav .fav-star {
		font-size: 0.85rem;
		line-height: 1;
	}

	.card-action--fav-active {
		color: var(--accent-warm) !important;
		border-color: rgba(251, 191, 36, 0.3) !important;
	}

	.card-action--fav-active:hover {
		background: rgba(251, 191, 36, 0.1) !important;
	}

	.card-action--pianoroll:hover {
		color: #6366f1;
		border-color: #6366f1;
		background: rgba(99, 102, 241, 0.08);
	}

	@media (prefers-reduced-motion: reduce) {
		.card { animation: none; }
	}

	@media (max-width: 600px) {
		.grid {
			grid-template-columns: 1fr;
			gap: var(--space-md);
		}

		.filter-tab {
			min-height: 44px;
			padding: 8px 14px;
		}

		.card-actions {
			opacity: 1;
		}

		.card-action {
			padding: 6px 10px;
			min-height: 32px;
		}
	}
</style>
