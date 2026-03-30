<script lang="ts">
	import ChordProgression from './ChordProgression.svelte';

	let {
		onsubmit
	}: {
		onsubmit: (chords: string, comment: string) => void;
	} = $props();

	let chordsText = $state('');
	let comment = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!chordsText.trim() || loading) return;
		loading = true;
		try {
			await onsubmit(chordsText.trim(), comment.trim());
			chordsText = '';
			comment = '';
		} finally {
			loading = false;
		}
	}
</script>

<div class="chord-input-area">
	{#if chordsText.trim()}
		<div class="preview">
			<span class="preview-label">Preview</span>
			<ChordProgression chords={chordsText} />
		</div>
	{/if}

	<form onsubmit={handleSubmit}>
		<textarea
			class="chord-input"
			bind:value={chordsText}
			placeholder="| Am7 Dm7 | G7 | Cmaj7 |"
			rows="2"
		></textarea>

		<div class="input-row">
			<input
				type="text"
				bind:value={comment}
				placeholder="Add a comment..."
				class="comment-input"
			/>
			<button
				type="submit"
				class="btn btn-primary"
				disabled={!chordsText.trim() || loading}
			>
				{loading ? 'Posting...' : 'Post'}
			</button>
		</div>
	</form>
</div>

<style>
	.chord-input-area {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: var(--space-md);
	}

	.preview {
		margin-bottom: var(--space-sm);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--border-subtle);
		overflow-x: auto;
	}

	.preview-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		font-weight: 500;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	textarea.chord-input {
		width: 100%;
		resize: vertical;
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		box-sizing: border-box;
	}

	.input-row {
		display: flex;
		gap: var(--space-sm);
	}

	.comment-input {
		flex: 1;
		font-size: 0.85rem;
	}
</style>
