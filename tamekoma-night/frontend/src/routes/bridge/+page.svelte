<script lang="ts">
	import { onMount } from 'svelte';

	type Os = 'mac' | 'win' | 'linux' | 'unknown';

	let os = $state<Os>('unknown');

	const downloads = {
		mac: {
			url: 'https://github.com/kuma-private/cadenza-bridge/releases/latest/download/Cadenza-Bridge.dmg',
			label: 'Download for macOS (Apple Silicon + Intel)'
		},
		win: {
			url: 'https://github.com/kuma-private/cadenza-bridge/releases/latest/download/Cadenza-Bridge.msi',
			label: 'Download for Windows'
		},
		linux: {
			url: 'https://github.com/kuma-private/cadenza-bridge/releases/latest/download/Cadenza-Bridge-linux.tar.gz',
			label: 'Download for Linux'
		}
	} as const;

	onMount(() => {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes('mac')) os = 'mac';
		else if (ua.includes('windows')) os = 'win';
		else if (ua.includes('linux')) os = 'linux';
	});
</script>

<svelte:head>
	<title>Cadenza Bridge — Download</title>
</svelte:head>

<div class="bridge-page">
	<header class="hero">
		<div class="hero-icon" aria-hidden="true">
			<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="6" width="18" height="12" rx="2" />
				<path d="M7 10h.01M11 10h.01M15 10h.01" />
				<path d="M7 14h10" />
			</svg>
		</div>
		<h1>Cadenza Bridge</h1>
		<p class="lead">
			VST3 / CLAP プラグインを <strong>Cadenza.fm</strong> から使うためのネイティブ companion app です。
			Web ではできない本物のプラグインホスティングを、ローカルで動かします。
		</p>
	</header>

	<section class="features">
		<h2>Premium で解禁される機能</h2>
		<ul class="feature-list">
			<li><span class="bullet">◆</span> 本物の VST3 / CLAP プラグインホスト</li>
			<li><span class="bullet">◆</span> Mixer タブのフル解禁 (sends, buses, master chain)</li>
			<li><span class="bullet">◆</span> Automation でフィルタースイープ等を描画</li>
			<li><span class="bullet">◆</span> WAV 高品質エクスポート</li>
			<li><span class="bullet">◆</span> メニューバー / トレイのみ常駐 (Dock に出ない)</li>
			<li><span class="bullet">◆</span> OS ログイン時自動起動 + クラッシュ自動復旧</li>
			<li><span class="bullet">◆</span> 自動更新</li>
		</ul>
	</section>

	<section class="download">
		{#if os === 'mac' || os === 'win' || os === 'linux'}
			<a class="download-btn" href={downloads[os].url}>
				<span class="arrow" aria-hidden="true">↓</span>
				{downloads[os].label}
			</a>
			<p class="detected">お使いの OS を自動検出しました ({os === 'mac' ? 'macOS' : os === 'win' ? 'Windows' : 'Linux'})</p>
		{:else}
			<p class="unknown">OS を自動検出できませんでした。下記から選んでください。</p>
		{/if}

		<details class="other-os">
			<summary>その他の OS / 別バージョン</summary>
			<ul>
				<li><a href={downloads.mac.url}>macOS (.dmg)</a></li>
				<li><a href={downloads.win.url}>Windows (.msi)</a></li>
				<li><a href={downloads.linux.url}>Linux (.tar.gz)</a></li>
			</ul>
		</details>
	</section>

	<section class="steps">
		<h2>インストール手順</h2>
		<ol>
			<li>上のボタンからパッケージをダウンロードします</li>
			<li>
				<strong>macOS:</strong> .dmg をダブルクリックしてマウントし、
				<code>Cadenza Bridge.app</code> を Applications フォルダにドラッグ
			</li>
			<li><strong>Windows:</strong> .msi をダブルクリックしてウィザードに従う</li>
			<li>初回起動時にメニューバー / システムトレイにアイコンが現れます</li>
			<li>次回以降は OS ログイン時に自動で起動します (アイコンから無効化可能)</li>
			<li>Cadenza.fm を開くと自動的に接続されます</li>
		</ol>
	</section>

	<section class="requirements">
		<h2>システム要件</h2>
		<ul>
			<li>macOS 11.0 Big Sur 以上</li>
			<li>Windows 10 (64-bit) 以上</li>
			<li>約 30 MB のディスク空き容量</li>
			<li>Cadenza Premium プラン (<a href="/upgrade">アップグレードはこちら</a>)</li>
		</ul>
	</section>

	<footer class="foot">
		<a href="/">← Cadenza.fm に戻る</a>
	</footer>
</div>

<style>
	.bridge-page {
		max-width: 760px;
		margin: 0 auto;
		padding: var(--space-xl) var(--space-lg) var(--space-2xl);
		color: var(--text-primary);
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-sm);
		padding: var(--space-xl) 0 var(--space-lg);
	}

	.hero-icon {
		color: var(--accent-primary);
		opacity: 0.85;
	}

	.hero h1 {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}

	.lead {
		color: var(--text-secondary);
		font-size: 0.95rem;
		line-height: 1.6;
		max-width: 560px;
		margin: 0;
	}

	section {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
		margin-bottom: var(--space-lg);
	}

	section h2 {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
		margin: 0 0 var(--space-md);
		color: var(--text-primary);
	}

	.feature-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: var(--space-sm);
	}

	.feature-list li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--text-secondary);
		font-size: 0.88rem;
	}

	.bullet {
		color: var(--accent-primary);
		font-size: 0.7rem;
	}

	.download {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	.download-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-xl);
		background: var(--accent-primary);
		color: #111;
		font-weight: 600;
		text-decoration: none;
		border-radius: var(--radius-md);
		font-size: 0.95rem;
		box-shadow: var(--shadow-card);
		transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
	}

	.download-btn:hover {
		background: var(--accent-warm);
		transform: translateY(-2px);
		box-shadow: var(--shadow-elevated);
	}

	.arrow {
		font-size: 1.1rem;
	}

	.detected {
		color: var(--text-muted);
		font-size: 0.75rem;
		margin: 0;
	}

	.unknown {
		color: var(--text-secondary);
		margin: 0;
	}

	.other-os {
		margin-top: var(--space-sm);
		color: var(--text-secondary);
		font-size: 0.82rem;
	}

	.other-os summary {
		cursor: pointer;
		color: var(--text-muted);
	}

	.other-os ul {
		list-style: none;
		padding: var(--space-sm) 0 0;
		margin: 0;
		display: flex;
		gap: var(--space-md);
		justify-content: center;
		flex-wrap: wrap;
	}

	.other-os a {
		color: var(--accent-secondary);
		text-decoration: none;
	}

	.other-os a:hover {
		text-decoration: underline;
	}

	.steps ol {
		padding-left: var(--space-lg);
		margin: 0;
		color: var(--text-secondary);
		line-height: 1.7;
		font-size: 0.88rem;
	}

	.steps code {
		font-family: var(--font-mono);
		background: var(--bg-elevated);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 0.82rem;
	}

	.requirements ul {
		list-style: none;
		padding: 0;
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.88rem;
		display: grid;
		gap: var(--space-xs);
	}

	.requirements a {
		color: var(--accent-primary);
	}

	.foot {
		text-align: center;
		padding: var(--space-md) 0 0;
	}

	.foot a {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.85rem;
	}

	.foot a:hover {
		color: var(--text-secondary);
	}

	@media (max-width: 600px) {
		.bridge-page {
			padding: var(--space-md) var(--space-md) var(--space-xl);
		}

		.hero h1 {
			font-size: 1.6rem;
		}

		.lead {
			font-size: 0.88rem;
		}
	}
</style>
