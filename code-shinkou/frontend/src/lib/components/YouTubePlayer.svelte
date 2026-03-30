<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		videoId: string;
	}

	let { videoId }: Props = $props();

	let playerElement: HTMLDivElement;
	let player: YT.Player | null = null;

	function loadYouTubeApi(): Promise<void> {
		return new Promise((resolve) => {
			if (window.YT && window.YT.Player) {
				resolve();
				return;
			}

			const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
			if (!existing) {
				const tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';
				document.head.appendChild(tag);
			}

			(window as any).onYouTubeIframeAPIReady = () => resolve();
		});
	}

	function initPlayer(id: string) {
		if (!playerElement || !id) return;

		if (player) {
			player.destroy();
			player = null;
		}

		player = new YT.Player(playerElement, {
			videoId: id,
			width: '100%',
			height: '100%',
			playerVars: {
				autoplay: 0,
				modestbranding: 1,
				rel: 0
			},
			events: {
				onReady: () => {
					// Store reference globally for time capture
					(window as any).__codeShinkou_player = player;
				}
			}
		});
	}

	onMount(async () => {
		await loadYouTubeApi();
		initPlayer(videoId);
	});

	onDestroy(() => {
		if (player) {
			player.destroy();
			player = null;
		}
		delete (window as any).__codeShinkou_player;
	});
</script>

<div class="player-wrapper">
	<div class="player-container">
		<div bind:this={playerElement}></div>
	</div>
</div>

<style>
	.player-wrapper {
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
	}

	.player-container {
		position: relative;
		width: 100%;
		padding-bottom: 56.25%; /* 16:9 */
		height: 0;
		overflow: hidden;
		border-radius: 8px;
		background: #111;
	}

	.player-container :global(iframe) {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
</style>
