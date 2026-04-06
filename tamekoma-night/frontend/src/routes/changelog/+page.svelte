<script lang="ts">
</script>

<svelte:head>
	<title>変更ログ - Cadenza.fm</title>
</svelte:head>

<div class="legal-page">
	<h1>変更ログ</h1>

	<section class="changelog-entry">
		<h2>2026-04-06</h2>
		<ul>
			<li>Cadenza.fm v2 リリース</li>
			<li>Flow Editor, Text View, Visualizer, Mixer</li>
			<li>AI ディレクティブ提案</li>
			<li>マルチトラック再生</li>
			<li>Warm Amber テーマ</li>
		</ul>
	</section>
</div>

<style>
	.legal-page {
		max-width: 700px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-xl);
		min-height: calc(100vh - 44px);
	}

	h1 {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text-primary);
		margin-bottom: var(--space-xl);
	}

	.changelog-entry {
		margin-bottom: var(--space-xl);
	}

	.changelog-entry h2 {
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--accent-primary);
		margin-bottom: var(--space-sm);
	}

	.changelog-entry ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.changelog-entry li {
		font-size: 0.88rem;
		color: var(--text-secondary);
		padding-left: var(--space-md);
		position: relative;
	}

	.changelog-entry li::before {
		content: '-';
		position: absolute;
		left: 0;
		color: var(--text-muted);
	}

	@media (max-width: 600px) {
		.legal-page {
			padding: var(--space-md) var(--space-md);
		}
	}
</style>
