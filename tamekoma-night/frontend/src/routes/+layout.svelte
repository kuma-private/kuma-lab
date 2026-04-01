<script lang="ts">
	import '$lib/styles/theme.css';
	import '$lib/styles/chord-colors.css';
	import { type Snippet } from 'svelte';
	import ServiceHeader from '$lib/components/ServiceHeader.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Tamekoma Night</title>
</svelte:head>

<ServiceHeader />
{@render children()}
