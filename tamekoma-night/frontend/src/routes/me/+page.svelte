<script lang="ts">
	import { onMount } from 'svelte';
	import { getMe, getSongs } from '$lib/api';
	import { planStore } from '$lib/stores/plan.svelte';
	import type { UserInfo } from '$lib/api';
	import type { SongListItem } from '$lib/types/song';

	let user = $state<UserInfo | null>(null);
	let songs = $state<SongListItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const sortedSongs = $derived.by(() => {
		return [...songs].sort(
			(a, b) => new Date(b.lastEditedAt).getTime() - new Date(a.lastEditedAt).getTime()
		);
	});

	const getInitial = (name: string): string => {
		return name.charAt(0).toUpperCase();
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

	const handleLogout = async () => {
		try {
			await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
		} catch {}
		window.location.href = '/';
	};

	onMount(async () => {
		try {
			const [u, s] = await Promise.all([getMe(), getSongs()]);
			user = u;
			songs = s;
			planStore.initFromAuth(u.tier);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			if (error === 'LOGIN_REQUIRED') {
				window.location.href = '/';
				return;
			}
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>マイページ - Cadenza.fm</title>
</svelte:head>

<div class="mypage">
	{#if loading}
		<div class="loading-full">
			<div class="loading-spinner"></div>
		</div>
	{:else if error}
		<div class="error-banner" role="alert">{error}</div>
	{:else if user}
		<!-- Profile -->
		<div class="profile-section">
			<div class="avatar-large">{getInitial(user.name)}</div>
			<div class="profile-info">
				<div class="profile-name">{user.name}</div>
				<div class="profile-email">{user.email}</div>
			</div>
		</div>

		<!-- My Songs -->
		<div class="section-bar">
			<h2 class="section-title">My Songs</h2>
			{#if songs.length > 0}
				<span class="song-count">{songs.length}</span>
			{/if}
		</div>

		{#if sortedSongs.length > 0}
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
		{:else}
			<div class="empty-hint">まだSongがありません。</div>
		{/if}

		<!-- Account -->
		<div class="section-bar">
			<h2 class="section-title">アカウント</h2>
		</div>
		<div class="account-links">
			<a href="/terms" class="account-link">利用規約</a>
			<a href="/privacy" class="account-link">プライバシーポリシー</a>
			<a href="/changelog" class="account-link">変更ログ</a>
			<button class="account-link account-link--logout" onclick={handleLogout}>ログアウト</button>
		</div>
	{/if}
</div>

<style>
	.mypage {
		max-width: 700px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-xl);
		min-height: calc(100vh - 44px);
	}

	.loading-full {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 40vh;
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

	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
	}

	/* Profile */
	.profile-section {
		display: flex;
		align-items: center;
		gap: var(--space-lg);
		padding: var(--space-lg) 0;
	}

	.avatar-large {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: var(--accent-primary);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.profile-info {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}

	.profile-name {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.profile-email {
		font-size: 0.82rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Section */
	.section-bar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-lg) 0 var(--space-sm);
		border-top: 1px solid var(--border-subtle);
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.song-count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--accent-primary);
		background: rgba(232, 168, 76, 0.12);
		padding: 2px var(--space-sm);
		border-radius: var(--radius-full);
	}

	/* Song cards */
	.song-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
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

	/* Account links */
	.account-links {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin-bottom: var(--space-xl);
	}

	.account-link {
		display: block;
		padding: var(--space-sm) var(--space-md);
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-decoration: none;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
		font-family: var(--font-sans);
		border-radius: var(--radius-sm);
		transition: all 0.15s;
	}

	.account-link:hover {
		color: var(--text-primary);
		background: var(--bg-surface);
	}

	.account-link--logout {
		color: var(--error);
	}

	.account-link--logout:hover {
		color: var(--error);
		background: rgba(224, 96, 80, 0.08);
	}

	@media (max-width: 600px) {
		.mypage {
			padding: var(--space-md) var(--space-md);
		}

		.profile-section {
			gap: var(--space-md);
		}

		.avatar-large {
			width: 48px;
			height: 48px;
			font-size: 1.2rem;
		}

		.song-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
