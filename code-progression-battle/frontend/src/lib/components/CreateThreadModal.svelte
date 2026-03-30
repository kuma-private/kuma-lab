<script lang="ts">
	interface Props {
		onClose: () => void;
		onCreate: (data: { title: string; key: string; timeSignature: string; bpm: number; opponentEmail: string }) => void;
	}

	let { onClose, onCreate }: Props = $props();

	let title = $state('');
	let rootNote = $state('C');
	let quality = $state('Major');
	let timeSigTop = $state(4);
	let timeSigBottom = $state(4);
	let bpm = $state(120);
	let opponentEmail = $state('');

	const roots = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
	const qualities = ['Major', 'Minor', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian'];
	const timeSigOptions = [2, 3, 4, 5, 6, 7];

	const handleSubmit = () => {
		if (!title.trim()) return;
		const key = `${rootNote} ${quality}`;
		const timeSignature = `${timeSigTop}/${timeSigBottom}`;
		onCreate({
			title: title.trim(),
			key,
			timeSignature,
			bpm: Math.max(40, Math.min(300, bpm)),
			opponentEmail: opponentEmail.trim()
		});
	};

	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') onClose();
	};
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-overlay" onclick={onClose}>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>新しいセッション</h2>
			<button class="btn btn-ghost" onclick={onClose} aria-label="Close">
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="4" y1="4" x2="14" y2="14" />
					<line x1="14" y1="4" x2="4" y2="14" />
				</svg>
			</button>
		</div>

		<form onsubmit={handleSubmit}>
			<div class="field">
				<label for="title">タイトル</label>
				<input id="title" type="text" bind:value={title} placeholder="真夜中のジャズセッション..." />
			</div>

			<div class="field">
				<label for="root">キー</label>
				<div class="field-row-inner">
					<select id="root" bind:value={rootNote}>
						{#each roots as r}
							<option value={r}>{r}</option>
						{/each}
					</select>
					<select bind:value={quality}>
						{#each qualities as q}
							<option value={q}>{q}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="field-row">
				<div class="field">
					<label for="ts-top">拍子</label>
					<div class="field-row-inner">
						<select id="ts-top" bind:value={timeSigTop}>
							{#each timeSigOptions as n}
								<option value={n}>{n}</option>
							{/each}
						</select>
						<span class="ts-slash">/</span>
						<select bind:value={timeSigBottom}>
							<option value={4}>4</option>
							<option value={8}>8</option>
						</select>
					</div>
				</div>

				<div class="field">
					<label for="bpm">BPM</label>
					<input id="bpm" type="number" min="40" max="300" bind:value={bpm} />
				</div>
			</div>

			<div class="field">
				<label for="opponent">対戦相手のメールアドレス</label>
				<input id="opponent" type="email" bind:value={opponentEmail} placeholder="friend@example.com" />
			</div>

			<div class="actions">
				<button type="button" class="btn btn-secondary" onclick={onClose}>キャンセル</button>
				<button type="submit" class="btn btn-primary" disabled={!title.trim()}>
					セッション開始
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-lg);
	}

	.modal-header h2 {
		font-family: var(--font-display);
		margin: 0;
		color: var(--accent-primary);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}

	.field label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field input,
	.field select {
		width: 100%;
	}

	.field-row {
		display: flex;
		gap: var(--space-md);
	}

	.field-row-inner {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.ts-slash {
		color: var(--text-muted);
		font-size: 1.2rem;
	}

	input[type="number"] {
		max-width: 100px;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		margin-top: var(--space-sm);
	}
</style>
