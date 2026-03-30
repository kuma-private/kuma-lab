<script lang="ts">
	import '$lib/styles/theme.css';
	import '$lib/styles/chord-colors.css';
	import { type Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Code Progression Battle</title>
</svelte:head>

{@render children()}
