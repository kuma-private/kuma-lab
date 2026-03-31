<script lang="ts">
	import type { Thread } from '$lib/api';

	interface Props {
		thread: Thread;
		drawerOpen: boolean;
		error: string | null;
		onOpenLog: () => void;
		onExport: () => void;
		onUpdateSettings: (data: { key?: string; timeSignature?: string; bpm?: number }) => void;
	}

	let {
		thread,
		drawerOpen,
		error,
		onOpenLog,
		onExport,
		onUpdateSettings,
	}: Props = $props();

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
		editBpm = thread.bpm;
		editingBpm = true;
	};

	const saveBpm = () => {
		editingBpm = false;
		const clamped = Math.max(40, Math.min(300, editBpm));
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

	const memberCount = $derived(thread.members?.length ?? 0);
</script>

<header class="thread-header">
	<a href="/" class="back-link">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
			<polyline points="10,2 4,8 10,14" />
		</svg>
		戻る
	</a>
	<div class="thread-info">
		<h1 class="thread-title">{thread.title}</h1>
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
					<select class="inline-select inline-select--sm" value={editTimeSigTop} onchange={(e) => { editTimeSigTop = Number(e.currentTarget.value); }}>
						{#each timeSigOptions as n}
							<option value={n}>{n}</option>
						{/each}
					</select>
					<span class="ts-slash">/</span>
					<select class="inline-select inline-select--sm" value={editTimeSigBottom} onchange={(e) => { editTimeSigBottom = Number(e.currentTarget.value); }} onblur={saveTimeSig}>
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
						class="inline-input"
						type="number"
						min="40"
						max="300"
						value={editBpm}
						oninput={(e) => { editBpm = Number(e.currentTarget.value); }}
						onblur={saveBpm}
						onkeydown={(e) => { if (e.key === 'Enter') saveBpm(); }}
					/>
					<button class="inline-save-btn" onclick={saveBpm}>OK</button>
				</div>
			{:else}
				<button class="badge badge-editable" onclick={startEditBpm} title="クリックして変更">BPM {thread.bpm}</button>
			{/if}

			{#if memberCount > 0}
				<span class="badge badge-members">{memberCount}人参加中</span>
			{/if}
		</div>
	</div>
	<div class="header-actions">
		<button class="btn-log" onclick={onOpenLog} title="保存履歴">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
			</svg>
			履歴
		</button>
		<button class="btn btn-ghost" onclick={onExport}>エクスポート</button>
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

		.header-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
