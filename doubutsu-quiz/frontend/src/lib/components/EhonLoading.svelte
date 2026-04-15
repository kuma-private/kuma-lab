<script lang="ts">
	import { ehon } from '$lib/stores/ehon.svelte';

	let dots = $state('');
	$effect(() => {
		const id = setInterval(() => {
			dots = dots.length >= 3 ? '' : dots + '・';
		}, 420);
		return () => clearInterval(id);
	});

	let mode = $derived(ehon.mode ?? 'cosmos');
	let storyKind = $derived(ehon.active ? 'えほん' : 'なぜなぜ');

	const tips: readonly string[] = [
		// --- えほん メタ / プロセス ---
		'えほんの かみさまは ときどき おしゃべりが ながい よ',
		'いらすとや には 8421 まいも えが ある んだって！',
		'きょうの えほんは きっと いままでで いちばん おもしろい よ',
		'ももたろう の おじいさんは やさしい かおを しているよ',
		'えほんは よんで もらう と もっと たのしい よ',
		'5 ねんかん よんでも ぜんぶ ちがう えほんが つくれる よ',
		'たくさん よんだら じぶんの おはなしも つくれる かもね',
		'かおすなえほん は びっくりする かもよ！',
		'どうぶつが 20 まい でてくる ことも ある よ',
		'ぼくの いちばん すきな ばめんは さいごの ページだよ',
		'こいぬも ねこも うさぎも でてくる かもしれない',
		'よる ねるまえ に よむと いい ゆめを みれる かもね',
		'ページを めくる ときが いちばん どきどき するね',
		'おなじ ことばでも こえに だすと ちがって きこえる よ',
		'ちいさな せかい が いま うまれて いる ところ だよ',
		'クレヨンの かみさま が いっしょうけんめい ぬってる',
		'いい おはなし は ちょっと じかん が かかる もんだ',
		'ことば の たね を いま うえて いる よ',
		'おはなし の みずを あげて いる ところ だよ',
		'きょう の おはなし は どんな いろ に なるかな',
		'もうすぐ できる から ワクワク して まってて ね',
		'ふでを はこんで いる おと が きこえる かもよ',
		// --- しぜん / どうぶつ の まめちしき ---
		'そら が あおく みえるのは ひかり の いたずら なんだって',
		'にじ は あめ と おひさま の がったい わざ だよ',
		'つき は ちきゅう の まわりを ぐるぐる まわってる よ',
		'ほし は じつは すごく おおきい のに とおい から ちいさく みえる',
		'くも は みず の つぶ の あつまり なんだって',
		'くじら の うた は なんひゃく キロ さき まで とどく らしい',
		'ぞう は みず を はな で くちに はこんで のむ んだよ',
		'きりん の くび の ほね の かず は にんげん と おなじ 7 つ',
		'たこ は あたま が よくて ふた を あけられる んだって',
		'かめ は 100 ねん も いきる ことが ある らしい よ',
		'さかな は ねながら およぐ ことが できる んだって',
		'ペンギン は とべない けど およぐの は とっても はやい',
		'ねこ は いちにち 16 じかん も ねて いる よ',
		'いぬ は にんげん より 40 ばい に おい が わかる',
		'あり は じぶん の たいじゅう の 50 ばい を もてる',
		'ちょうちょ は ストロー みたいな くち で みつ を のむ',
		'かたつむり は じぶん の からで くらして いる よ',
		'はち の はね は 1 びょうかん に 200 かい うごく',
		'くも の いと は はがね より つよい と いわれて いる',
		// --- たべもの / まいにち ---
		'こめつぶ ひとつ に たくさん の てま が かかって いる',
		'はちみつ は くさらない しょくりょう なんだって',
		'バナナ の すじ は えいよう が いっぱい ある らしい',
		'あめだま は ゆっくり なめた ほうが ながく たのしめる',
		'トマト は やさい か くだもの か おとな も なやんで いる',
		// --- よむ / まなぶ ---
		'おなじ えほん を 3 かい よむと あたらしい ことに きづく',
		'こえ に だして よむと きもち が よく つたわる よ',
		'しらない ことば は おとな に きいて みよう',
		'えほん の すみっこ も よーく みて みてね',
		'ページ の うら に ちいさな おまけ が かくれてる かも',
		// --- なぜなぜ ---
		'しつもん を するのは とっても えらい こと なんだ',
		'こたえ が わかると つぎ の しつもん が うまれる よ',
		'なぜ？と おもう きもち を だいじに しよう',
		'せかい には まだ だれも しらない こたえ が たくさん',
		'はかせ も なやむ しつもん が いっぱい ある んだって'
	];

	let tipIndex = $state(0);
	$effect(() => {
		const id = setInterval(() => {
			tipIndex = (tipIndex + 1) % tips.length;
		}, 5000);
		return () => clearInterval(id);
	});
</script>

<div class="loading-wrap" data-mode={mode}>
	<div class="frame">
		<div class="frame-inner">
			<div class="paper">
				<div class="curtain left"></div>
				<div class="curtain right"></div>
				<div class="center">
					<div class="spinner">
						<span>&#x2728;</span>
						<span>&#x1F4D6;</span>
						<span>&#x2728;</span>
					</div>
					<p class="text">{storyKind}を つくってるよ{dots}</p>
					<p class="sub">ちょっと まっててね</p>
				</div>
			</div>
		</div>
	</div>

	<div class="tip-box" aria-live="polite">
		<span class="tip-label">&#x1F4A1; ちょこっと まめちしき</span>
		{#key tipIndex}
			<p class="tip">{tips[tipIndex]}</p>
		{/key}
	</div>
</div>

<style>
	.loading-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		width: min(720px, 94vw);
		padding: 20px 0;
	}

	.frame {
		width: 100%;
		padding: 22px;
		background: linear-gradient(145deg, #8a5a2b 0%, #5a3518 50%, #3e2410 100%);
		border-radius: 6px;
		box-shadow:
			inset 0 0 0 2px rgba(255, 220, 170, 0.3),
			0 18px 40px rgba(40, 20, 5, 0.4);
	}

	.frame-inner {
		aspect-ratio: 4 / 3;
		position: relative;
		overflow: hidden;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgba(70, 38, 10, 0.5);
	}

	.paper {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, #fcf5e8 0%, #f5e7c6 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.curtain {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		background:
			repeating-linear-gradient(
				90deg,
				rgba(248, 226, 178, 0.55) 0px,
				rgba(248, 226, 178, 0.55) 14px,
				rgba(225, 195, 140, 0.55) 14px,
				rgba(225, 195, 140, 0.55) 28px
			),
			linear-gradient(180deg, rgba(255, 248, 232, 0.4) 0%, rgba(245, 220, 175, 0.4) 100%);
		box-shadow: inset 0 0 18px rgba(120, 72, 24, 0.18);
		pointer-events: none;
	}

	.curtain.left {
		left: 0;
		animation: curtainOpenLeft 2.2s ease-in-out infinite alternate;
		transform-origin: left center;
		border-right: 1px solid rgba(120, 72, 24, 0.15);
	}
	.curtain.right {
		right: 0;
		animation: curtainOpenRight 2.2s ease-in-out infinite alternate;
		transform-origin: right center;
		border-left: 1px solid rgba(120, 72, 24, 0.15);
	}

	.center {
		position: relative;
		z-index: 1;
		text-align: center;
	}

	.spinner {
		display: flex;
		gap: 14px;
		justify-content: center;
		font-size: 2.6rem;
	}

	.spinner span {
		animation: bounceLoad 1.1s ease-in-out infinite;
	}

	.spinner span:nth-child(2) {
		animation-delay: 0.15s;
	}
	.spinner span:nth-child(3) {
		animation-delay: 0.3s;
	}

	.text {
		margin-top: 14px;
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-weight: 800;
		font-size: 1.45rem;
		color: #3d2b1f;
		letter-spacing: 0.08em;
		text-shadow: 0 1px 0 #fff8e8, 0 0 12px rgba(255, 248, 232, 0.7);
	}

	.sub {
		margin-top: 8px;
		font-size: 1rem;
		font-weight: 700;
		color: #6b3e1f;
		opacity: 0.9;
		text-shadow: 0 1px 0 #fff8e8;
	}

	.loading-wrap[data-mode='chaos'] .text {
		color: #6a1b9a;
		text-shadow: 0 1px 0 #fff8e8, 0 0 14px rgba(255, 248, 232, 0.8);
	}

	@keyframes curtainOpenLeft {
		0%, 100% {
			transform: scaleX(0.35);
		}
		50% {
			transform: scaleX(0.55);
		}
	}

	@keyframes curtainOpenRight {
		0%, 100% {
			transform: scaleX(0.35);
		}
		50% {
			transform: scaleX(0.55);
		}
	}

	@keyframes bounceLoad {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-14px);
		}
	}

	.tip-box {
		width: min(560px, 92%);
		margin-top: 6px;
		padding: 16px 22px 18px;
		background: rgba(255, 248, 225, 0.95);
		border: 1.5px solid rgba(139, 90, 40, 0.35);
		border-radius: 22px;
		box-shadow:
			inset 0 0 0 3px rgba(255, 255, 255, 0.55),
			0 10px 22px rgba(70, 38, 10, 0.18);
		text-align: center;
		position: relative;
	}

	.tip-box::before {
		content: '';
		position: absolute;
		top: -10px;
		left: 50%;
		width: 20px;
		height: 20px;
		background: rgba(255, 248, 225, 0.95);
		border-left: 1.5px solid rgba(139, 90, 40, 0.35);
		border-top: 1.5px solid rgba(139, 90, 40, 0.35);
		transform: translateX(-50%) rotate(45deg);
		border-top-left-radius: 4px;
	}

	.tip-label {
		display: inline-block;
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: 0.78rem;
		font-weight: 700;
		color: #8a5a2b;
		letter-spacing: 0.12em;
		margin-bottom: 6px;
	}

	.tip {
		font-family: 'Klee One', 'Hiragino Mincho ProN', serif;
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1.6;
		color: #3d2b1f;
		letter-spacing: 0.04em;
		margin: 0;
		min-height: 2.6em;
		animation: tipFade 0.8s ease-out both;
	}

	.loading-wrap[data-mode='chaos'] .tip-box {
		background: rgba(255, 244, 210, 0.95);
		border-color: rgba(90, 50, 20, 0.45);
	}

	.loading-wrap[data-mode='chaos'] .tip-box::before {
		background: rgba(255, 244, 210, 0.95);
		border-color: rgba(90, 50, 20, 0.45);
	}

	.loading-wrap[data-mode='chaos'] .tip-label {
		color: #8a2be2;
	}

	@keyframes tipFade {
		0% {
			opacity: 0;
			transform: translateY(6px);
		}
		20% {
			opacity: 1;
			transform: translateY(0);
		}
		85% {
			opacity: 1;
			transform: translateY(0);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
