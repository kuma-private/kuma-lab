<script lang="ts">
	import type { Thread } from '$lib/api';

	interface Props {
		thread: Thread;
		drawerOpen: boolean;
		error: string | null;
		submitting: boolean;
		hasChanges: boolean;
		visibility: string;
		onDelete?: () => void;
		onOpenLog: () => void;
		onExport: () => void;
		onSave: () => void;
		onShare: () => void;
		onUpdateSettings: (data: { title?: string; key?: string; timeSignature?: string; bpm?: number }) => void;
	}

	let {
		thread,
		drawerOpen,
		error,
		submitting,
		hasChanges = false,
		visibility = 'private',
		onOpenLog,
		onExport,
		onSave,
		onShare,
		onDelete,
		onUpdateSettings,
	}: Props = $props();

	const visibilityIcon = $derived(
		visibility === 'public' ? '\u{1F310}' : visibility === 'shared' ? '\u{1F465}' : '\u{1F512}'
	);

	// Inline edit states
	let editingKey = $state(false);
	let editingBpm = $state(false);
	let editingTimeSig = $state(false);

	let editKey = $state('');
	let editBpm = $state(0);
	let editTimeSigTop = $state(4);
	let editTimeSigBottom = $state(4);

	const keys = ['C Major', 'C Minor', 'C# Major', 'C# Minor', 'Db Major', 'Db Minor',
		'D Major', 'D Minor', 'D# Major', 'D# Minor', 'Eb Major', 'Eb Minor',
		'E Major', 'E Minor', 'F Major', 'F Minor', 'F# Major', 'F# Minor',
		'Gb Major', 'Gb Minor', 'G Major', 'G Minor', 'G# Major', 'G# Minor',
		'Ab Major', 'Ab Minor', 'A Major', 'A Minor', 'A# Major', 'A# Minor',
		'Bb Major', 'Bb Minor', 'B Major', 'B Minor',
		'C Dorian', 'D Dorian', 'E Dorian', 'F Dorian', 'G Dorian', 'A Dorian', 'B Dorian',
		'C Mixolydian', 'D Mixolydian', 'E Mixolydian', 'F Mixolydian', 'G Mixolydian', 'A Mixolydian', 'B Mixolydian'];
	const timeSigOptions = [2, 3, 4, 5, 6, 7];

	const startEditKey = () => {
		editKey = thread.key;
		editingKey = true;
	};

	const saveKey = () => {
		editingKey = false;
		if (editKey !== thread.key) {
			onUpdateSettings({ key: editKey });
		}
	};

	const startEditBpm = () => {
		editingBpm = true;
		// Set initial value after DOM renders
		requestAnimationFrame(() => {
			if (bpmInputEl) {
				bpmInputEl.value = String(thread.bpm);
				bpmInputEl.focus();
				bpmInputEl.select();
			}
		});
	};

	let bpmInputEl: HTMLInputElement;

	const saveBpm = () => {
		// Read from input ref before it gets removed
		const val = bpmInputEl ? Number(bpmInputEl.value) : editBpm;
		const clamped = Math.max(40, Math.min(300, val || thread.bpm));
		editingBpm = false;
		if (clamped !== thread.bpm) {
			onUpdateSettings({ bpm: clamped });
		}
	};

	const startEditTimeSig = () => {
		const parts = thread.timeSignature.split('/').map(Number);
		editTimeSigTop = parts[0] || 4;
		editTimeSigBottom = parts[1] || 4;
		editingTimeSig = true;
	};

	const saveTimeSig = () => {
		editingTimeSig = false;
		const newTs = `${editTimeSigTop}/${editTimeSigBottom}`;
		if (newTs !== thread.timeSignature) {
			onUpdateSettings({ timeSignature: newTs });
		}
	};

	let editingTitle = $state(false);
	let editTitle = $state('');

	let titleInputEl = $state<HTMLInputElement | undefined>(undefined);

	const startEditTitle = () => {
		editTitle = thread.title;
		editingTitle = true;
		requestAnimationFrame(() => titleInputEl?.focus());
	};

	const saveTitle = () => {
		if (!editingTitle) return;
		const trimmed = editTitle.trim();
		editingTitle = false;
		if (trimmed && trimmed !== thread.title) {
			onUpdateSettings({ title: trimmed });
		}
	};

</script>

<header class="thread-header">
	<a href="/" class="back-link">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="10,2 4,8 10,14" />
		</svg>
		戻る
	</a>
	<div class="thread-info">
		{#if editingTitle}
			<input
				class="title-input"
				bind:this={titleInputEl}
				bind:value={editTitle}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.isComposing) {
						e.preventDefault();
						saveTitle();
					} else if (e.key === 'Escape') {
						editingTitle = false;
					}
				}}
				onblur={saveTitle}
			/>
		{:else}
			<h1 class="thread-title" onclick={startEditTitle} title="クリックして変更">{thread.title}</h1>
		{/if}
		<div class="thread-meta">
			<!-- Key badge: click to edit -->
			{#if editingKey}
				<select class="inline-select" bind:value={editKey} onchange={() => { saveKey(); }} onblur={saveKey}>
					{#each keys as k}
						<option value={k}>{k}</option>
					{/each}
				</select>
			{:else}
				<button class="badge badge-editable" onclick={startEditKey} title="クリックして変更">Key: {thread.key}</button>
			{/if}

			<!-- Time signature badge: click to edit -->
			{#if editingTimeSig}
				<div class="inline-edit-row">
					<select class="inline-select inline-select--sm" bind:value={editTimeSigTop} onchange={() => { saveTimeSig(); }}>
						{#each timeSigOptions as n}
							<option value={n}>{n}</option>
						{/each}
					</select>
					<span class="ts-slash">/</span>
					<select class="inline-select inline-select--sm" bind:value={editTimeSigBottom} onchange={() => { saveTimeSig(); }} onblur={saveTimeSig}>
						<option value={4}>4</option>
						<option value={8}>8</option>
					</select>
					<button class="inline-save-btn" onclick={saveTimeSig}>OK</button>
				</div>
			{:else}
				<button class="badge badge-editable" onclick={startEditTimeSig} title="クリックして変更">{thread.timeSignature}</button>
			{/if}

			<!-- BPM badge: click to edit -->
			{#if editingBpm}
				<div class="inline-edit-row">
					<input
						bind:this={bpmInputEl}
						class="inline-input"
						type="number"
						min="40"
						max="300"
						onkeydown={(e) => { if (e.key === 'Enter' && !e.isComposing) saveBpm(); }}
					/>
					<button class="inline-save-btn" onclick={saveBpm}>OK</button>
				</div>
			{:else}
				<button class="badge badge-editable" onclick={startEditBpm} title="クリックして変更">BPM {thread.bpm}</button>
			{/if}
		</div>
	</div>
	<div class="header-actions">
		<button
			class="btn-save-header"
			class:btn-save-header--saved={!hasChanges && !submitting}
			onclick={onSave}
			disabled={submitting || !hasChanges}
		>
			{#if submitting}
				<span class="save-spinner"></span>
				保存中...
			{:else if hasChanges}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
					<polyline points="17 21 17 13 7 13 7 21" />
					<polyline points="7 3 7 8 15 8" />
				</svg>
				保存
			{:else}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<polyline points="20 6 9 17 4 12" />
				</svg>
				保存済み
			{/if}
		</button>
		<button class="btn-log" onclick={onOpenLog} title="保存履歴">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
			履歴
		</button>
		<button class="btn-share" onclick={onShare} title="共有設定">
			<span class="share-icon">{visibilityIcon}</span>
			共有
		</button>
		<button class="btn btn-ghost" onclick={onExport}>エクスポート</button>
		{#if onDelete}
			<button class="btn btn-ghost btn-ghost--danger" onclick={onDelete}>削除</button>
		{/if}
	</div>
</header>

{#if error}
	<div class="error-banner">{error}</div>
{/if}

<style>
	/* Header */
	.thread-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-lg);
		padding-bottom: var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		margin-bottom: var(--space-lg);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--text-secondary);
		text-decoration: none;
		flex-shrink: 0;
		padding-top: 4px;
	}

	.thread-info { flex: 1; }

	.thread-title {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 8px;
		cursor: pointer;
		border-bottom: 1px dashed transparent;
	}

	.thread-title:hover {
		border-bottom-color: var(--border-default);
	}

	.title-input {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 700;
		color: var(--text-primary);
		background: var(--bg-base);
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		padding: 2px 8px;
		margin: 0 0 8px;
		width: auto;
		min-width: 120px;
		max-width: 400px;
		box-sizing: border-box;
		outline: none;
	}

	.thread-meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.badge-editable {
		cursor: pointer;
		transition: all 0.15s;
		background: var(--bg-elevated);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		padding: 2px 10px;
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}

	.badge-editable:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	.badge-members {
		background: rgba(52, 211, 153, 0.1);
		border: 1px solid rgba(52, 211, 153, 0.3);
		border-radius: var(--radius-sm);
		padding: 2px 10px;
		font-size: 0.72rem;
		color: var(--success);
	}

	.inline-edit-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.inline-select {
		padding: 2px 6px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: var(--font-mono);
	}

	.inline-select--sm {
		width: 50px;
	}

	.ts-slash {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.inline-input {
		width: 70px;
		padding: 2px 6px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.78rem;
		font-family: var(--font-mono);
	}

	.inline-save-btn {
		padding: 2px 8px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
	}

	.header-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		flex-shrink: 0;
	}

	/* Save button */
	.btn-save-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 14px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-save-header:hover:not(:disabled) {
		background: var(--accent-secondary);
		transform: translateY(-1px);
	}

	.btn-save-header:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.btn-save-header--saved {
		background: var(--bg-elevated);
		color: var(--success);
		border: 1px solid rgba(52, 211, 153, 0.3);
	}

	.btn-ghost--danger:hover {
		color: var(--error) !important;
	}

	.save-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Log button */
	.btn-log {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		position: relative;
	}

	.btn-log:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.1);
	}

	/* Share button */
	.btn-share {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 12px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-share:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.1);
	}

	.share-icon {
		font-size: 0.85rem;
	}

	.error-banner {
		background: rgba(248, 113, 113, 0.1);
		border: 1px solid rgba(248, 113, 113, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		color: var(--error);
		margin-bottom: var(--space-md);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.thread-header {
			flex-wrap: wrap;
			gap: var(--space-sm);
		}

		.thread-title {
			font-size: 1.1rem;
		}

		.title-input {
			max-width: 100%;
			font-size: 1.1rem;
		}

		.badge-editable {
			padding: 4px 10px;
			min-height: 32px;
		}

		.header-actions {
			width: 100%;
			justify-content: flex-end;
			flex-wrap: wrap;
		}

		.btn-save-header,
		.btn-log,
		.btn-share,
		.btn.btn-ghost {
			min-height: 36px;
		}
	}
</style>
