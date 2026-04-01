<script lang="ts">
	import type { Thread } from '$lib/api';
	import { extractRoot } from '$lib/chord-parser';

	interface Props {
		threads: Thread[];
		filter: string;
		onFilterChange: (filter: string) => void;
	}

	let { threads, filter = 'all', onFilterChange = () => {} }: Props = $props();

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
			return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
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
		'A': '#a78bfa', 'A#': '#c084fc', 'Bb': '#c084fc',
		'B': '#f472b6',
	};

	const keyColor = (key: string): string => KEY_COLORS[key.split(' ')[0]] || '#a78bfa';

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
</div>

{#if threads.length === 0}
	<div class="empty">
		<div class="empty-chords" aria-hidden="true">| Cmaj7 | Dm7 | G7 | Cmaj7 |</div>
		<p class="empty-title">まだスコアがありません</p>
		<p class="empty-sub">新規作成してコードを放とう</p>
	</div>
{:else}
	<div class="grid">
		{#each threads as thread, i}
			{@const chords = previewChords(thread.score)}
			{@const color = keyColor(thread.key)}
			<a
				href="/thread/{thread.id}"
				class="card"
				style="animation-delay: {Math.min(i * 0.04, 0.6)}s"
				aria-label="{thread.title} - {thread.key} {thread.bpm}BPM"
			>
				<div class="card-accent" style="background: {color}"></div>

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
						<span class="card-time">{formatDate(thread.lastEditedAt)}</span>
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
		background: rgba(167, 139, 250, 0.08);
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
		transition: transform 0.2s, box-shadow 0.2s;
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
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		border-color: rgba(167, 139, 250, 0.3);
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

	.card-time {
		font-size: 0.65rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.card { animation: none; }
	}

	@media (max-width: 600px) {
		.grid {
			grid-template-columns: 1fr;
			gap: var(--space-md);
		}
	}
</style>
