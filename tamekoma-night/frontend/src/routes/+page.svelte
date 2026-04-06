<script lang="ts">
	import { onMount } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { createSongStore } from '$lib/stores/song.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';

	const store = createAppStore();
	const songStore = createSongStore();
	let threadFilter = $state('all');
	let authChecked = $state(false);
	let sortMode = $state<'latest' | 'name'>('latest');
	let templateMenuOpen = $state(false);
	let songLoading = $state(false);

	const TEMPLATES: { label: string; score: string }[] = [
		{ label: '空のスコア', score: '' },
		{ label: 'カノン進行', score: '| C | G | Am | Em |\n| F | C | F | G |' },
		{ label: 'ブルース進行', score: '| C7 | C7 | C7 | C7 |\n| F7 | F7 | C7 | C7 |\n| G7 | F7 | C7 | G7 |' },
	];

	onMount(async () => {
		await store.checkLogin();
		authChecked = true;
		if (store.loggedIn) {
			store.loadThreads();
			songStore.loadSongs();
		}
	});

	const sortedSongs = $derived.by(() => {
		return [...songStore.songs].sort(
			(a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime()
		);
	});

	const handleNewSong = async () => {
		try {
			const song = await songStore.createSong('無題のスコア');
			if (song) {
				window.location.href = `/song/${song.id}`;
			}
		} catch {
			// error is set in store
		}
	};

	const formatTime = (iso: string): string => {
		try {
			const d = new Date(iso);
			const diff = Date.now() - d.getTime();
			const mins = Math.floor(diff / 60000);
			if (mins < 1) return 'たった今';
			if (mins < 60) return `${mins}分前`;
			const hours = Math.floor(mins / 60);
			if (hours < 24) return `${hours}時間前`;
			const days = Math.floor(hours / 24);
			if (days < 7) return `${days}日前`;
			return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
		} catch { return ''; }
	};

	const filteredThreads = $derived.by(() => {
		let list = store.threads;
		const userId = store.user?.sub || '';
		if (threadFilter === 'mine') list = list.filter(t => t.createdBy === userId);
		if (threadFilter === 'shared') list = list.filter(t => t.visibility === 'shared' || t.visibility === 'public');

		if (sortMode === 'name') {
			list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
		} else {
			list = [...list].sort((a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime());
		}
		return list;
	});

	const recentThreads = $derived(
		[...store.threads].sort((a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime()).slice(0, 3)
	);

	const handleNewSession = async (initialScore?: string) => {
		templateMenuOpen = false;
		const result = await store.createThread({ title: '無題のスコア' });
		if (result) {
			if (initialScore) {
				try {
					const { saveScore } = await import('$lib/api');
					await saveScore(result.id, { score: initialScore, comment: 'テンプレートから作成' });
				} catch { /* proceed even if save fails */ }
			}
			window.location.href = `/thread/${result.id}`;
		}
	};

	const toggleTemplateMenu = () => {
		templateMenuOpen = !templateMenuOpen;
	};

	const handleWindowClick = (e: MouseEvent) => {
		if (!templateMenuOpen) return;
		const target = e.target as HTMLElement;
		if (!target.closest('.btn-new-wrap')) {
			templateMenuOpen = false;
		}
	};
</script>

<svelte:window onclick={handleWindowClick} />

<svelte:head>
	<title>Cadenza.fm</title>
</svelte:head>

<div class="page-bg" aria-hidden="true">
	<div class="bg-stars"></div>
	<div class="bg-city"></div>
	<div class="orb orb-1"></div>
	<div class="orb orb-2"></div>
</div>

<div class="page">
	{#if !authChecked}
		<div class="loading-full">
			<div class="loading-spinner"></div>
		</div>
	{:else if !store.loggedIn}
		<div class="login-screen">
			<div class="login-card">
				<div class="login-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M9 18V5l12-2v13" />
						<circle cx="6" cy="18" r="3" />
						<circle cx="18" cy="16" r="3" />
					</svg>
				</div>
				<h1 class="login-title">Cadenza.fm</h1>
				<p class="login-sub">Arrange by text, hear it live.</p>
				<p class="login-tagline">コード進行エディタ</p>
				<a href="/auth/google" class="btn-google">
					<svg width="18" height="18" viewBox="0 0 24 24">
						<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
						<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
						<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
						<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
					</svg>
					Googleでログイン
				</a>
			</div>
		</div>
	{:else}

		<div class="slogan">Arrange by text, hear it live.</div>

		{#if recentThreads.length > 0}
			<div class="recent-activity">
				<h3 class="recent-title">最近の編集</h3>
				{#each recentThreads as thread}
					<a href="/thread/{thread.id}" class="recent-item">
						<span class="recent-name">{thread.title}</span>
						<span class="recent-time">{formatTime(thread.lastEditedAt)}</span>
					</a>
				{/each}
			</div>
		{/if}

		<!-- Song section -->
		<div class="section-bar">
			<div class="section-left">
				<h2 class="section-title">Song</h2>
				{#if songStore.songs.length > 0}
					<span class="top-count">{songStore.songs.length}</span>
				{/if}
			</div>
			<button class="btn-new btn-new--song" onclick={handleNewSong}>
				<span class="btn-new-icon">+</span>
				新規Song
			</button>
		</div>

		{#if songStore.loading}
			<div class="skeleton-cards" role="status" aria-label="読み込み中">
				{#each [1,2] as _}
					<div class="skeleton-card">
						<div class="skeleton-line skeleton-title"></div>
						<div class="skeleton-line skeleton-meta"></div>
					</div>
				{/each}
			</div>
		{:else if sortedSongs.length > 0}
			<div class="song-cards">
				{#each sortedSongs as song}
					<a href="/song/{song.id}" class="song-card">
						<div class="song-card-header">
							<span class="song-card-title">{song.title}</span>
						</div>
						<div class="song-card-meta">
							<span class="song-meta-item">{song.trackCount ?? 0} tracks</span>
							<span class="song-meta-sep">·</span>
							<span class="song-meta-item">{song.key || 'C'}</span>
							<span class="song-meta-sep">·</span>
							<span class="song-meta-item">{song.bpm || 120} BPM</span>
						</div>
						<div class="song-card-time">{formatTime(song.lastEditedAt)}</div>
					</a>
				{/each}
			</div>
		{:else if !songStore.error}
			<div class="empty-hint">まだSongがありません。「新規Song」で曲を作りましょう。</div>
		{/if}

		{#if songStore.error}
			<div class="error-banner" role="alert">{songStore.error}</div>
		{/if}

		<!-- Thread section -->
		<div class="top-bar">
			<div class="top-left">
				<h1 class="top-title">スコア</h1>
				{#if store.threads.length > 0}
					<span class="top-count">{store.threads.length}</span>
				{/if}
				<div class="sort-pills">
					<button class="sort-pill" class:sort-pill--active={sortMode === 'latest'} onclick={() => sortMode = 'latest'}>最新順</button>
					<button class="sort-pill" class:sort-pill--active={sortMode === 'name'} onclick={() => sortMode = 'name'}>名前順</button>
				</div>
			</div>
			<div class="btn-new-wrap">
				<button class="btn-new" onclick={toggleTemplateMenu}>
					<span class="btn-new-icon">+</span>
					新規作成
				</button>
				{#if templateMenuOpen}
					<div class="template-menu">
						{#each TEMPLATES as tmpl}
							<button class="template-option" onclick={() => handleNewSession(tmpl.score || undefined)}>
								{tmpl.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if store.error}
			<div class="error-banner" role="alert">{store.error}</div>
		{/if}

		<main class="main">
			{#if store.loading}
				<div class="skeleton-cards" role="status" aria-label="読み込み中">
					{#each [1,2,3] as _}
						<div class="skeleton-card">
							<div class="skeleton-line skeleton-title"></div>
							<div class="skeleton-line skeleton-meta"></div>
						</div>
					{/each}
				</div>
			{:else}
				<ThreadList threads={filteredThreads} filter={threadFilter} onFilterChange={(f) => { threadFilter = f; }} onCreate={() => handleNewSession()} />
			{/if}
		</main>

		<footer class="app-footer">
			<span>Cadenza.fm</span>
			<span>·</span>
			<span>コード進行エディタ</span>
		</footer>
	{/if}
</div>

<style>
	.page-bg {
		position: fixed;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: -1;
		background: linear-gradient(180deg, #080604 0%, #0f0a04 40%, #1a1408 70%, #241c0e 100%);
	}

	.bg-stars {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(2px 2px at 8% 10%, #f0e0c8, transparent),
			radial-gradient(2px 2px at 22% 6%, #f0e0c8, transparent),
			radial-gradient(3px 3px at 38% 18%, #e8a84c, transparent),
			radial-gradient(2px 2px at 52% 4%, #f0e0c8, transparent),
			radial-gradient(2px 2px at 68% 14%, #f0e0c8, transparent),
			radial-gradient(3px 3px at 82% 9%, #f0c060, transparent),
			radial-gradient(1.5px 1.5px at 12% 26%, #e8e0d0, transparent),
			radial-gradient(2px 2px at 32% 30%, #f0e0c8, transparent),
			radial-gradient(1.5px 1.5px at 58% 24%, #e8e0d0, transparent),
			radial-gradient(3px 3px at 78% 28%, #c4956a, transparent),
			radial-gradient(2px 2px at 90% 20%, #f0e0c8, transparent),
			radial-gradient(4px 4px at 18% 2%, #e8a84c, transparent),
			radial-gradient(1.5px 1.5px at 45% 34%, #e8e0d0, transparent),
			radial-gradient(2px 2px at 95% 6%, #f0e0c8, transparent),
			radial-gradient(2px 2px at 5% 38%, #f0e0c8, transparent),
			radial-gradient(3px 3px at 65% 8%, #f0c060, transparent),
			radial-gradient(2px 2px at 28% 16%, #f0e0c8, transparent),
			radial-gradient(1.5px 1.5px at 72% 36%, #e8e0d0, transparent),
			radial-gradient(2px 2px at 48% 12%, #f0e0c8, transparent),
			radial-gradient(3px 3px at 85% 22%, #e8a84c, transparent);
		animation: twinkle 3s ease-in-out infinite alternate;
	}

	@keyframes twinkle {
		0% { opacity: 0.8; }
		100% { opacity: 1; }
	}

	.bg-city {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 35%;
		background: linear-gradient(180deg, transparent 0%, rgba(232,168,76,0.03) 50%, rgba(192,148,106,0.06) 100%);
	}

	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(100px);
		will-change: transform;
	}

	.orb-1 {
		width: 500px;
		height: 500px;
		background: var(--accent-primary);
		bottom: -200px;
		right: 10%;
		opacity: 0.06;
		animation: drift1 16s ease-in-out infinite;
	}

	.orb-2 {
		width: 400px;
		height: 400px;
		background: var(--accent-secondary);
		bottom: -150px;
		left: 15%;
		opacity: 0.05;
		animation: drift2 20s ease-in-out infinite;
	}

	@keyframes drift1 {
		0%, 100% { transform: translate(0, 0); }
		50% { transform: translate(-30px, -20px); }
	}

	@keyframes drift2 {
		0%, 100% { transform: translate(0, 0); }
		50% { transform: translate(20px, -15px); }
	}

	.page {
		max-width: 1000px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-xl);
		min-height: calc(100vh - 44px);
	}

	/* Login screen */
	.loading-full {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
	}

	.login-screen {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 70vh;
	}

	.login-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-2xl) var(--space-xl);
		background: rgba(20, 20, 50, 0.6);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		backdrop-filter: blur(12px);
		text-align: center;
		max-width: 360px;
		width: 100%;
	}

	.login-icon {
		color: var(--accent-primary);
		opacity: 0.8;
		animation: float-note 3s ease-in-out infinite;
	}

	@keyframes float-note {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-6px); }
	}

	.login-title {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.login-sub {
		color: var(--text-muted);
		font-size: 0.88rem;
		margin: 0;
	}

	.login-tagline {
		color: var(--text-muted);
		font-size: 0.72rem;
		margin: 0;
		opacity: 0.5;
		letter-spacing: 0.08em;
	}

	.btn-google {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 32px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: #fff;
		color: #333;
		font-size: 0.88rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
		margin-top: var(--space-md);
	}

	.btn-google:hover {
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
		transform: translateY(-2px);
		background: #f8f8ff;
	}

	.slogan {
		text-align: center;
		font-size: 0.85rem;
		color: var(--text-muted);
		padding: var(--space-lg) 0 var(--space-sm);
		letter-spacing: 0.15em;
		opacity: 0.8;
	}

	/* Recent activity */
	.recent-activity {
		margin-bottom: var(--space-lg);
		padding: var(--space-md);
		background: rgba(167, 139, 250, 0.04);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
	}

	.recent-title {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin: 0 0 var(--space-sm);
	}

	.recent-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: inherit;
		transition: background 0.15s;
	}

	.recent-item:not(:last-child) {
		border-bottom: 1px solid var(--border-subtle);
	}

	.recent-item:hover {
		background: rgba(167, 139, 250, 0.08);
	}

	.recent-item:hover .recent-name {
		color: var(--accent-primary);
	}

	.recent-name {
		font-size: 0.82rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color 0.15s;
	}

	.recent-time {
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.6;
		flex-shrink: 0;
		margin-left: var(--space-md);
	}

	/* Sort pills */
	.sort-pills {
		display: flex;
		gap: 2px;
		margin-left: var(--space-sm);
	}

	.sort-pill {
		padding: 4px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.68rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sort-pill:hover {
		color: var(--text-secondary);
		border-color: var(--border-default);
	}

	.sort-pill--active {
		color: var(--accent-primary);
		border-color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) 0 var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-lg);
	}

	.top-left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.top-title {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.top-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.12);
		padding: 2px 8px;
		border-radius: 10px;
	}

	.btn-new {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 18px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.btn-new:hover {
		background: #d09440;
		transform: translateY(-1px);
		box-shadow: 0 4px 16px rgba(232, 168, 76, 0.35);
	}

	.btn-new:focus-visible {
		outline: 2px solid var(--accent-primary);
		outline-offset: 2px;
	}

	.btn-new-icon {
		font-size: 1.1rem;
		font-weight: 300;
		line-height: 1;
	}

	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
		margin-bottom: var(--space-md);
	}

	.loading {
		display: flex;
		justify-content: center;
		padding: var(--space-2xl);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.app-footer {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-2xl) 0 var(--space-lg);
		font-size: 0.7rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.orb, .loading-spinner, .login-icon { animation: none; }
	}

	/* Skeleton loading */
	.skeleton-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--space-md);
	}

	.skeleton-card {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.skeleton-line {
		border-radius: var(--radius-sm);
		background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 50%, var(--bg-elevated) 75%);
		background-size: 200% 100%;
		animation: skeleton-shimmer 1.5s infinite;
	}

	.skeleton-title { height: 20px; width: 60%; }
	.skeleton-meta { height: 14px; width: 40%; }

	@keyframes skeleton-shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.btn-new-wrap {
		position: relative;
	}

	.template-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 180px;
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: var(--z-dropdown);
		overflow: hidden;
		animation: menu-in 0.15s ease;
	}

	@keyframes menu-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.template-option {
		display: block;
		width: 100%;
		padding: 10px 16px;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.82rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.12s;
	}

	.template-option:hover {
		background: rgba(167, 139, 250, 0.1);
		color: var(--accent-primary);
	}

	.template-option:not(:last-child) {
		border-bottom: 1px solid var(--border-subtle);
	}

	/* Song section */
	.section-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--space-md) 0 var(--space-sm);
	}

	.section-left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.btn-new--song {
		font-size: 0.78rem;
		padding: 6px 14px;
	}

	.song-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}

	.song-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		padding: var(--space-md);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: inherit;
		transition: all 0.15s;
	}

	.song-card:hover {
		border-color: var(--accent-primary);
		background: var(--bg-elevated);
		transform: translateY(-2px);
		box-shadow: var(--shadow-card);
	}

	.song-card-header {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.song-card-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.song-card-meta {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.song-meta-sep {
		opacity: 0.4;
	}

	.song-card-time {
		font-size: 0.68rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	.empty-hint {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-align: center;
		padding: var(--space-lg) 0;
		opacity: 0.6;
		margin-bottom: var(--space-lg);
	}

	@media (max-width: 600px) {
		.orb { display: none; }

		.page {
			padding: var(--space-md) var(--space-md);
		}

		.top-bar {
			flex-direction: column;
			align-items: stretch;
			gap: var(--space-md);
		}

		.btn-new {
			justify-content: center;
		}

		.skeleton-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
