<script lang="ts">
	import '$lib/styles/theme.css';
	import '$lib/styles/chord-colors.css';
	import { onMount, type Snippet } from 'svelte';
	import ServiceHeader from '$lib/components/ServiceHeader.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { bridgeStore } from '$lib/stores/bridge.svelte';
	import { songStore } from '$lib/stores/song.svelte';
	import { planStore } from '$lib/stores/plan.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		bridgeStore.init();
		// E2E test hook — only exposed when localStorage.cadenzaE2E === '1'.
		// Production builds never get this global. Playwright fixtures set the
		// flag via storageState / addInitScript before navigation.
		try {
			if (typeof window !== 'undefined' && window.localStorage.getItem('cadenzaE2E') === '1') {
				(window as unknown as { __cadenza?: unknown }).__cadenza = {
					bridgeStore,
					songStore,
					planStore
				};
			}
		} catch {
			/* localStorage unavailable — ignore */
		}
	});
</script>

<svelte:head>
	<title>Cadenza.fm</title>
</svelte:head>

<ServiceHeader />
<div class="page-content">
	{@render children()}
</div>
<Toast />

<style>
	.page-content {
		animation: page-fade-in 0.2s ease-out;
	}

	@keyframes page-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
