<script lang="ts">
	import { onMount } from 'svelte';
	import { getMe } from '$lib/api';
	import { planStore } from '$lib/stores/plan.svelte';
	import type { UserInfo } from '$lib/api';

	let user = $state<UserInfo | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			user = await getMe();
			planStore.initFromAuth(user.tier);
		} catch {
			user = null;
		}
	});

	async function startCheckout() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/stripe/checkout', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});
			if (res.status === 401) {
				window.location.href = '/auth/google';
				return;
			}
			if (!res.ok) {
				error = `checkout failed: ${res.status}`;
				return;
			}
			const data = (await res.json()) as { url?: string };
			if (data.url) {
				window.location.href = data.url;
			} else {
				error = 'checkout returned no url';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Premium にアップグレード — Cadenza.fm</title>
</svelte:head>

<div class="upgrade-page">
	<header class="hero">
		<h1>Premium プラン</h1>
		<p class="lead">
			本物の VST / CLAP プラグインと、フル機能の Mixer / Automation を解放します。
		</p>
	</header>

	<section class="plan">
		<div class="plan-card">
			<div class="plan-label">Premium</div>
			<div class="plan-price">
				<span class="currency">¥</span>
				<span class="amount">1,000</span>
				<span class="period">/ month</span>
			</div>
			<ul class="plan-features">
				<li>Mixer タブ (sends, buses, master chain)</li>
				<li>Automation タブ (パラメータ自動化)</li>
				<li>VST3 / CLAP プラグインホスティング</li>
				<li>Cadenza Bridge ローカル常駐アプリ</li>
				<li>WAV 高品質エクスポート</li>
				<li>自然言語による Mixer 編集</li>
			</ul>
			<button
				class="btn-upgrade"
				type="button"
				onclick={startCheckout}
				disabled={loading || planStore.isPremium}
			>
				{#if planStore.isPremium}
					ご加入中です
				{:else if loading}
					処理中…
				{:else}
					アップグレードする
				{/if}
			</button>
			{#if error}
				<div class="error" role="alert">{error}</div>
			{/if}
			<p class="stub-note">
				※ Phase 9 時点では決済フローはスタブです。Phase 10 で Stripe Checkout に接続します。
			</p>
		</div>
	</section>

	<section class="extras">
		<h2>Bridge について</h2>
		<p>
			Premium の機能は、ローカルで動く <a href="/bridge">Cadenza Bridge</a> というネイティブアプリ経由で提供されます。
			インストールは数クリックで完了し、一度設定すればあとはログイン時に自動起動します。
		</p>
	</section>

	<footer class="foot">
		<a href="/">← Cadenza.fm に戻る</a>
	</footer>
</div>

<style>
	.upgrade-page {
		max-width: 680px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-lg) var(--space-2xl);
		color: var(--text-primary);
	}

	.hero {
		text-align: center;
		padding: var(--space-lg) 0;
	}

	.hero h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 var(--space-sm);
	}

	.lead {
		color: var(--text-secondary);
		font-size: 0.95rem;
		margin: 0;
	}

	.plan {
		padding: 0;
		background: transparent;
		border: 0;
		margin-bottom: var(--space-lg);
	}

	.plan-card {
		background: var(--bg-surface);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-xl);
		box-shadow: var(--shadow-elevated);
		text-align: center;
	}

	.plan-label {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--accent-primary);
		background: rgba(232, 168, 76, 0.1);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-full);
	}

	.plan-price {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 4px;
		padding: var(--space-md) 0;
		font-family: var(--font-display);
	}

	.currency {
		font-size: 1.3rem;
		color: var(--text-secondary);
	}

	.amount {
		font-size: 2.8rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.period {
		font-size: 0.88rem;
		color: var(--text-muted);
	}

	.plan-features {
		list-style: none;
		padding: 0;
		margin: var(--space-md) 0;
		text-align: left;
		display: grid;
		gap: var(--space-xs);
	}

	.plan-features li {
		color: var(--text-secondary);
		font-size: 0.88rem;
		padding-left: var(--space-md);
		position: relative;
	}

	.plan-features li::before {
		content: '✓';
		position: absolute;
		left: 0;
		color: var(--accent-primary);
	}

	.btn-upgrade {
		width: 100%;
		padding: var(--space-md);
		margin-top: var(--space-md);
		background: var(--accent-primary);
		color: #111;
		border: 0;
		border-radius: var(--radius-md);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, transform 0.15s;
	}

	.btn-upgrade:hover:not(:disabled) {
		background: var(--accent-warm);
		transform: translateY(-1px);
	}

	.btn-upgrade:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: var(--error);
		font-size: 0.85rem;
		margin-top: var(--space-sm);
	}

	.stub-note {
		color: var(--text-muted);
		font-size: 0.72rem;
		margin: var(--space-sm) 0 0;
	}

	.extras {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		margin-bottom: var(--space-lg);
	}

	.extras h2 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		margin: 0 0 var(--space-sm);
	}

	.extras p {
		color: var(--text-secondary);
		font-size: 0.88rem;
		line-height: 1.6;
		margin: 0;
	}

	.extras a {
		color: var(--accent-primary);
	}

	.foot {
		text-align: center;
		padding: var(--space-md) 0 0;
	}

	.foot a {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-decoration: none;
	}
</style>
