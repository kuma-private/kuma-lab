<script lang="ts">
	import '$lib/styles/theme.css';
	import '$lib/styles/chord-colors.css';
	import { onMount, type Snippet } from 'svelte';
	import ServiceHeader from '$lib/components/ServiceHeader.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { bridgeStore } from '$lib/stores/bridge.svelte';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		bridgeStore.init();
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
