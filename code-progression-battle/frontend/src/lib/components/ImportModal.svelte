<script lang="ts">
	import { importChordChart } from '$lib/api';
	import TapTempo from '$lib/components/TapTempo.svelte';

	type ImportStep = 'input' | 'loading' | 'preview';

	interface Props {
		open: boolean;
		threadId: string;
		initialBpm: number;
		initialTimeSignature: string;
		initialKey: string;
		onclose: () => void;
		onconfirm: (chords: string, meta: { bpm: number; timeSignature: string; key: string }) => void;
	}

	let {
		open,
		threadId,
		initialBpm,
		initialTimeSignature,
		initialKey,
		onclose,
		onconfirm,
	}: Props = $props();

	let step = $state<ImportStep>('input');
	let imagePreviews = $state<string[]>([]);
	let songName = $state('');
	let artist = $state('');
	let sourceUrl = $state('');
	let bpm = $state(0);
	let timeSignature = $state('4/4');
	let key = $state('');
	let resultChords = $state('');
	let error = $state<string | null>(null);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	// Reset state when modal opens
	$effect(() => {
		if (open) {
			step = 'input';
			imagePreviews = [];
			songName = '';
			artist = '';
			sourceUrl = '';
			bpm = initialBpm;
			timeSignature = initialTimeSignature;
			key = initialKey;
			resultChords = '';
			error = null;
		}
	});

	const keys = ['C Major', 'C Minor', 'C# Major', 'C# Minor', 'Db Major', 'Db Minor',
		'D Major', 'D Minor', 'D# Major', 'D# Minor', 'Eb Major', 'Eb Minor',
		'E Major', 'E Minor', 'F Major', 'F Minor', 'F# Major', 'F# Minor',
		'Gb Major', 'Gb Minor', 'G Major', 'G Minor', 'G# Major', 'G# Minor',
		'Ab Major', 'Ab Minor', 'A Major', 'A Minor', 'A# Major', 'A# Minor',
		'Bb Major', 'Bb Minor', 'B Major', 'B Minor'];

	const handleFiles = (files: FileList | null) => {
		if (!files) return;
		for (const file of Array.from(files)) {
			if (imagePreviews.length >= 5) break;
			const reader = new FileReader();
			reader.onload = () => {
				imagePreviews = [...imagePreviews, reader.result as string];
			};
			reader.readAsDataURL(file);
		}
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		handleFiles(e.dataTransfer?.files ?? null);
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
	};

	const removeImage = (index: number) => {
		imagePreviews = imagePreviews.filter((_, i) => i !== index);
	};

	const handlePaste = (e: ClipboardEvent) => {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of Array.from(items)) {
			if (!item.type.startsWith('image/') || imagePreviews.length >= 5) continue;
			e.preventDefault();
			const blob = item.getAsFile();
			if (!blob) continue;
			const reader = new FileReader();
			reader.onload = () => {
				imagePreviews = [...imagePreviews, reader.result as string];
			};
			reader.readAsDataURL(blob);
		}
	};

	const handleSubmit = async () => {
		if (imagePreviews.length === 0) return;
		step = 'loading';
		error = null;
		try {
			const result = await importChordChart(threadId, {
				images: imagePreviews,
				songName,
				artist,
				sourceUrl,
				bpm,
				timeSignature,
				key,
			});
			resultChords = result.chords;
			step = 'preview';
		} catch (e) {
			error = e instanceof Error ? e.message : 'インポートに失敗しました';
			step = 'input';
		}
	};

	const handleConfirm = () => {
		onconfirm(resultChords, { bpm, timeSignature, key });
		onclose();
	};

	const tsTop = $derived(Number(timeSignature.split('/')[0]) || 4);
	const tsBottom = $derived(Number(timeSignature.split('/')[1]) || 4);
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onclose}></div>
	<div class="modal" onpaste={handlePaste}>
		<div class="modal-header">
			<h2>コード譜インポート</h2>
			<button class="modal-close" onclick={onclose} type="button">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="3" y1="3" x2="13" y2="13" />
					<line x1="13" y1="3" x2="3" y2="13" />
				</svg>
			</button>
		</div>

		{#if step === 'input'}
			<div class="modal-body">
				{#if error}
					<div class="error-msg">{error}</div>
				{/if}

				<div
					class="drop-zone"
					class:drop-zone--has-images={imagePreviews.length > 0}
					ondrop={handleDrop}
					ondragover={handleDragOver}
					onclick={() => fileInputEl?.click()}
					role="button"
					tabindex="0"
				>
					{#if imagePreviews.length === 0}
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<path d="m21 15-5-5L5 21" />
						</svg>
						<p>ドロップ / クリック / ペースト（Ctrl+V）</p>
						<span class="drop-hint">最大5枚</span>
					{:else}
						<div class="image-thumbs">
							{#each imagePreviews as src, i}
								<div class="thumb">
									<img {src} alt="コード譜 {i + 1}" />
									<button class="thumb-remove" onclick={(e) => { e.stopPropagation(); removeImage(i); }} type="button">×</button>
								</div>
							{/each}
							{#if imagePreviews.length < 5}
								<div class="thumb thumb-add">+</div>
							{/if}
						</div>
					{/if}
				</div>
				<input
					bind:this={fileInputEl}
					type="file"
					accept="image/*"
					multiple
					hidden
					onchange={(e) => handleFiles(e.currentTarget.files)}
				/>

				<div class="meta-section">
					<div class="meta-row">
						<label class="meta-label" style="flex:2">
							<span>曲名（任意）</span>
							<input type="text" class="meta-input" bind:value={songName} placeholder="曲名で精度向上" />
						</label>
						<label class="meta-label" style="flex:1">
							<span>アーティスト（任意）</span>
							<input type="text" class="meta-input" bind:value={artist} placeholder="アーティスト名" />
						</label>
					</div>
					<label class="meta-label">
						<span>URL（任意）</span>
						<input type="text" class="meta-input" bind:value={sourceUrl} placeholder="https://www.ufret.jp/..." />
					</label>

					<div class="meta-row">
						<label class="meta-label meta-label--narrow">
							<span>BPM</span>
							<TapTempo {bpm} onchange={(v) => { bpm = v; }} />
						</label>

						<label class="meta-label meta-label--narrow">
							<span>拍子</span>
							<div class="ts-selects">
								<select
									class="meta-select"
									value={tsTop}
									onchange={(e) => { timeSignature = `${e.currentTarget.value}/${tsBottom}`; }}
								>
									{#each [2, 3, 4, 5, 6, 7] as n}
										<option value={n}>{n}</option>
									{/each}
								</select>
								<span class="ts-slash">/</span>
								<select
									class="meta-select"
									value={tsBottom}
									onchange={(e) => { timeSignature = `${tsTop}/${e.currentTarget.value}`; }}
								>
									{#each [4, 8] as n}
										<option value={n}>{n}</option>
									{/each}
								</select>
							</div>
						</label>

						<label class="meta-label meta-label--narrow">
							<span>Key</span>
							<select class="meta-select" bind:value={key}>
								<option value="">指定なし</option>
								{#each keys as k}
									<option value={k}>{k}</option>
								{/each}
							</select>
						</label>
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={onclose} type="button">キャンセル</button>
				<button
					class="btn-submit"
					onclick={handleSubmit}
					disabled={imagePreviews.length === 0}
					type="button"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M8 1v4M8 11v4M1 8h4M11 8h4M3 3l2.5 2.5M10.5 10.5L13 13M13 3l-2.5 2.5M5.5 10.5L3 13" />
					</svg>
					読み取り開始
				</button>
			</div>

		{:else if step === 'loading'}
			<div class="modal-body loading-body">
				<div class="loading-spinner"></div>
				<p>AI がコード譜を読み取り中...</p>
				<p class="loading-sub">10〜30秒ほどかかる場合があります</p>
			</div>

		{:else if step === 'preview'}
			<div class="modal-body">
				<p class="preview-label">読み取り結果（編集可能）</p>
				<textarea
					class="preview-textarea"
					bind:value={resultChords}
					rows="12"
				></textarea>
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => { step = 'input'; }} type="button">戻る</button>
				<button class="btn-submit" onclick={handleConfirm} type="button">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<polyline points="20 6 9 17 4 12" />
					</svg>
					確定
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
		animation: fade-in 0.15s ease;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 560px;
		max-width: 92vw;
		max-height: 90vh;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-modal);
		z-index: 101;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: modal-in 0.2s ease;
	}

	@keyframes modal-in {
		from { opacity: 0; transform: translate(-50%, -48%); }
		to { opacity: 1; transform: translate(-50%, -50%); }
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
	}

	.modal-header h2 {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.modal-close:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.modal-body {
		padding: var(--space-lg);
		overflow-y: auto;
		flex: 1;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-top: 1px solid var(--border-subtle);
	}

	/* Error */
	.error-msg {
		padding: var(--space-sm) var(--space-md);
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-sm);
		color: var(--error);
		font-size: 0.8rem;
		margin-bottom: var(--space-md);
	}

	/* Drop zone */
	.drop-zone {
		border: 2px dashed var(--border-default);
		border-radius: var(--radius-md);
		padding: var(--space-xl);
		text-align: center;
		cursor: pointer;
		transition: all 0.2s;
		color: var(--text-muted);
		margin-bottom: var(--space-lg);
	}

	.drop-zone:hover {
		border-color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.04);
	}

	.drop-zone p {
		font-size: 0.82rem;
		margin: var(--space-sm) 0 0;
		line-height: 1.5;
	}

	.drop-actions {
		margin-top: var(--space-sm);
	}

	.drop-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.72rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.drop-action-btn:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	.drop-hint {
		font-size: 0.7rem;
		opacity: 0.5;
		margin-top: var(--space-xs);
	}

	.drop-zone--has-images {
		padding: var(--space-md);
	}

	.image-thumbs {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
		justify-content: center;
	}

	.thumb {
		position: relative;
		width: 80px;
		height: 80px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--border-default);
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.thumb-remove {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 18px;
		height: 18px;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		color: #fff;
		font-size: 0.7rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	.thumb-add {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: var(--text-muted);
		background: var(--bg-base);
	}

	/* Meta section */
	.meta-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.meta-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.meta-label span {
		font-size: 0.72rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.meta-label--narrow {
		flex: 1;
		min-width: 0;
	}

	.meta-row {
		display: flex;
		gap: var(--space-md);
	}

	.meta-input {
		width: 100%;
		padding: 6px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.8rem;
		box-sizing: border-box;
	}

	.meta-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.meta-input::placeholder {
		color: var(--text-muted);
		opacity: 0.5;
	}

	.meta-select {
		padding: 5px 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: var(--font-mono);
	}

	.meta-select:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.ts-selects {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.ts-slash {
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	/* Buttons */
	.btn-cancel {
		padding: var(--space-sm) var(--space-lg);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.82rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.btn-submit {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-lg);
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-submit:hover:not(:disabled) {
		background: var(--accent-secondary);
		transform: translateY(-1px);
	}

	.btn-submit:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Loading */
	.loading-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl);
		gap: var(--space-sm);
	}

	.loading-spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading-body p {
		font-size: 0.85rem;
		color: var(--text-secondary);
		margin: 0;
	}

	.loading-sub {
		font-size: 0.75rem !important;
		color: var(--text-muted) !important;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Preview */
	.preview-label {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0 0 var(--space-sm);
	}

	.preview-textarea {
		width: 100%;
		padding: var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-base);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.6;
		resize: vertical;
		box-sizing: border-box;
	}

	.preview-textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
		box-shadow: 0 0 0 2px rgba(167, 139, 250, 0.15);
	}

	@media (max-width: 600px) {
		.modal {
			width: 96vw;
		}

		.drop-zone {
			padding: var(--space-lg);
		}

		.thumb {
			width: 64px;
			height: 64px;
		}

		.btn-cancel,
		.btn-submit {
			min-height: 40px;
		}

		.meta-row {
			flex-direction: column;
		}
	}
</style>
