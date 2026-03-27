<script lang="ts">
	import type { PageData } from './$types';
	import { ceremony } from '$lib/state/machine.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>罪のF#化 - Tsumi no Shouka</title>
	<meta name="description" content="Java/C#の罪深いコードをF#の光で浄化する儀式" />
</svelte:head>

<main>
	<p style="color: var(--gold); font-family: var(--font-title); text-align: center; padding-top: 4rem;">
		罪のF#化 — Loading ceremony components...
	</p>
</main>
