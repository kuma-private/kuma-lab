<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { createAppStore } from '$lib/stores/app.svelte';
	import { parseProgression, transpose, parseChord } from '$lib/chord-parser';
	import { ChordPlayer, type PlayerState, type OscPreset, type VoicingMode, setGlobalOscPreset, setVoicingMode, chordToNotes, onSelectionNotes, onSelectionPlaying, isSelectionPlaying, stopSelection } from '$lib/chord-player';
	import type { DisplayMode } from '$lib/components/ScoreEditor.svelte';
	import type { SaveHistory, Comment, Annotation } from '$lib/api';
	import { getComments, addComment, deleteComment, getAnnotations, addAnnotation, analyzeSelection } from '$lib/api';
	import PlayerBar from '$lib/components/PlayerBar.svelte';
	import ThreadHeader from '$lib/components/ThreadHeader.svelte';
	import ScorePanel from '$lib/components/ScorePanel.svelte';
	import ToolsPanel from '$lib/components/ToolsPanel.svelte';
	import SessionDrawer from '$lib/components/SessionDrawer.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';
	import { showToast } from '$lib/stores/toast.svelte';
	import { scoreToPianoRoll } from '$lib/piano-roll-model';
	import { pianoRollBarsToBase64 } from '$lib/midi-io';

	const store = createAppStore();
	const threadId = page.params.id as string;

	let player: ChordPlayer | null = null;
	let playerState = $state<PlayerState>('stopped');
	let currentTime = $state(0);
	let totalDuration = $state(0);
	let activeBarIndex = $state(-1);
	let currentChord = $state<string | null>(null);
	let playerVolume = $state(-10);
	let playerLoop = $state(false);
	let playerMetronome = $state(false);
	let playerVoicingMode = $state<VoicingMode>('normal');
	let selectionNotes = $state<string[]>([]);
	let selectionPlaying = $state(false);

	// Save state
	let commentInput = $state('');
	let submitting = $state(false);

	// ScoreEditor state
	let scoreEditorValue = $state('');
	let pendingInsertText = $state('');
	let scoreInitialized = $state(false);
	const hasChanges = $derived(store.currentThread ? scoreEditorValue !== (store.currentThread.score || '') : false);
	let scoreDisplayMode = $state<DisplayMode>('chord');

	// Import modal state
	let importModalOpen = $state(false);

	// Share modal state
	let shareModalOpen = $state(false);

	// Delete confirm dialog state
	let deleteConfirmOpen = $state(false);

	// Comments state
	let comments = $state<Comment[]>([]);

	// Annotations state
	let annotations = $state<Annotation[]>([]);

	// Drawer state
	let drawerOpen = $state(false);
	let historyItems = $state<SaveHistory[]>([]);

	const toggleDrawer = async () => {
		drawerOpen = !drawerOpen;
		if (drawerOpen) {
			historyItems = await store.loadHistory(threadId);
			try {
				comments = await getComments(threadId);
			} catch {
				// comments endpoint may not exist yet
			}
		}
	};

	const handleShare = () => {
		shareModalOpen = true;
	};

	const handleShareUpdate = (visibility: string, sharedWith: string[]) => {
		if (store.currentThread) {
			store.currentThread.visibility = visibility;
			store.currentThread.sharedWith = sharedWith;
		}
		showToast('共有設定を更新しました', 'success');
	};

	const handleAddComment = async (text: string) => {
		try {
			const comment = await addComment(threadId, {
				text,
				anchorType: 'global',
				anchorStart: 0,
				anchorEnd: 0,
				anchorSnapshot: '',
			});
			comments = [...comments, comment];
		} catch {
			// handle error silently
		}
	};

	const handleDeleteComment = async (commentId: string) => {
		try {
			await deleteComment(threadId, commentId);
			comments = comments.filter(c => c.id !== commentId);
		} catch {
			// handle error silently
		}
	};

	const closeDrawer = () => {
		drawerOpen = false;
	};

	let selectionPollTimer: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		store.checkLogin();
		store.loadThread(threadId);
		// Reset global audio state for this page
		setVoicingMode('normal');
		onSelectionNotes((notes) => { selectionNotes = notes; });
		// Poll isSelectionPlaying since callback-based $state update doesn't trigger Svelte re-render
		selectionPollTimer = setInterval(() => {
			const playing = isSelectionPlaying();
			if (playing !== selectionPlaying) selectionPlaying = playing;
		}, 100);
		// Load annotations for score display
		getAnnotations(threadId).then(a => { annotations = a; }).catch(() => {});
	});

	onDestroy(() => {
		player?.dispose();
		onSelectionNotes(null);
		if (selectionPollTimer) clearInterval(selectionPollTimer);
	});

	// Ctrl+S / Cmd+S to save, Spacebar play/pause, Arrow keys seek
	const handleKeydown = (e: KeyboardEvent) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 's') {
			e.preventDefault();
			handleSave();
		}
		if (e.key === ' ' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
			e.preventDefault();
			if (playerState === 'playing' || isSelectionPlaying()) handlePause();
			else handlePlay();
		}
		if (e.key === 'ArrowLeft') { e.preventDefault(); handleSeek(Math.max(0, currentTime - 5)); }
		if (e.key === 'ArrowRight') { e.preventDefault(); handleSeek(Math.min(totalDuration, currentTime + 5)); }
		// Ctrl+Shift+\ → insert bar line
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '|') {
			e.preventDefault();
			handleInsertBar();
		}
		// Ctrl+Enter → insert newline
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			handleInsertNewline();
		}
		// Ctrl+Up → transpose up
		if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
			e.preventDefault();
			handleTransposeUp();
		}
		// Ctrl+Down → transpose down
		if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
			e.preventDefault();
			handleTransposeDown();
		}
	};

	// Unsaved changes warning
	$effect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (hasChanges) { e.preventDefault(); }
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	// Sync ScoreEditor value from thread score
	$effect(() => {
		const thread = store.currentThread;
		if (thread && !scoreInitialized) {
			scoreEditorValue = thread.score || '';
			scoreInitialized = true;
		}
	});

	// Re-sync when thread updates (after save)
	let lastSyncedAt = $state('');
	$effect(() => {
		const thread = store.currentThread;
		if (thread && scoreInitialized && !submitting && thread.lastEditedAt !== lastSyncedAt) {
			scoreEditorValue = thread.score || '';
			lastSyncedAt = thread.lastEditedAt;
			transposeSemitones = 0;
		}
	});

	const parseTimeSignature = (ts: string) => {
		const [beats, beatValue] = ts.split('/').map(Number);
		return { beats: beats || 4, beatValue: beatValue || 4 };
	};

	const buildPlayer = () => {
		const thread = store.currentThread;
		if (!thread) return;
		const textToPlay = scoreEditorValue || thread.score || '';
		if (!textToPlay.trim()) return;
		player?.dispose();
		player = new ChordPlayer(
			{ bpm: thread.bpm, timeSignature: parseTimeSignature(thread.timeSignature) },
			{
				onStateChange: (s) => { playerState = s; },
				onProgress: (ct, td) => { currentTime = ct; totalDuration = td; },
				onBarChange: (idx) => { activeBarIndex = idx; },
				onChordChange: (chord) => { currentChord = chord; }
			}
		);
		player.setVolume(playerVolume);
		player.setLoop(playerLoop);
		player.setMetronome(playerMetronome);
		try {
			const { bars } = parseProgression(textToPlay);
			if (bars.length > 0) player.load(bars);
		} catch {
			// parse error - ignore
		}
	};

	const handlePlay = async () => {
		if (isSelectionPlaying()) { stopSelection(); return; }
		buildPlayer();
		if (player) await player.play();
	};
	const handlePause = () => {
		if (isSelectionPlaying()) { stopSelection(); return; }
		player?.pause();
	};
	const handleStop = () => { player?.stop(); stopSelection(); activeBarIndex = -1; currentChord = null; };
	const handleSeek = (time: number) => { player?.seekTo(time); };
	const handleVolumeChange = (db: number) => { playerVolume = db; player?.setVolume(db); };
	const handleLoopChange = (loop: boolean) => { playerLoop = loop; player?.setLoop(loop); };
	const handleMetronomeChange = (on: boolean) => { playerMetronome = on; player?.setMetronome(on); };
	const handleVoicingModeChange = (mode: VoicingMode) => { playerVoicingMode = mode; setVoicingMode(mode); };

	// Compute notes for the current chord to highlight on the keyboard
	const currentChordNotes = $derived.by(() => {
		// Selection playback notes take priority
		if (selectionNotes.length > 0) return selectionNotes;
		if (!currentChord || playerState !== 'playing') return [] as string[];
		try {
			const parsed = parseChord(currentChord);
			return chordToNotes(parsed);
		} catch {
			return [] as string[];
		}
	});

	let oscPreset = $state<OscPreset>('piano');
	const handleOscPresetChange = (preset: OscPreset) => {
		oscPreset = preset;
		setGlobalOscPreset(preset);
		player?.setOscPreset(preset);
	};

	const handleExport = () => {
		const thread = store.currentThread;
		if (!thread) return;
		const header = `# ${thread.title}\nKey: ${thread.key} | ${thread.timeSignature} | BPM ${thread.bpm}\n\n`;
		const body = thread.score || '';
		const md = header + body;
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${thread.title.replace(/\s+/g, '_')}.md`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleExportText = () => {
		const thread = store.currentThread;
		if (!thread) return;
		const body = thread.score || '';
		const blob = new Blob([body], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${thread.title.replace(/\s+/g, '_')}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const handleDelete = () => {
		deleteConfirmOpen = true;
	};

	const confirmDelete = async () => {
		deleteConfirmOpen = false;
		try {
			const { deleteThread } = await import('$lib/api');
			await deleteThread(threadId);
			showToast('スコアを削除しました', 'info');
			window.location.href = '/';
		} catch (e) {
			alert('削除に失敗しました');
		}
	};

	// Annotation handlers
	const handleReaction = async (emoji: string, startBar: number, endBar: number, snapshot: string) => {
		try {
			const comment = await addComment(threadId, {
				text: `${emoji} ${snapshot}`,
				anchorType: 'range',
				anchorStart: startBar,
				anchorEnd: endBar,
				anchorSnapshot: snapshot,
			});
			comments = [...comments, comment];
		} catch {
			// handle error silently
		}
	};

	const handleRangeComment = (startBar: number, endBar: number, snapshot: string) => {
		// Open drawer to comments tab and pre-fill with anchor info
		drawerOpen = true;
		getComments(threadId).then(c => { comments = c; }).catch(() => {});
	};

	const handleAiAnalyze = async (selectedChords: string) => {
		const thread = store.currentThread;
		if (!thread) return;
		try {
			const annotation = await analyzeSelection(threadId, {
				selectedChords,
				fullScore: scoreEditorValue,
				key: thread.key,
				timeSignature: thread.timeSignature
			});
			annotations = [...annotations, annotation];
		} catch {
			// handle error silently
		}
	};

	// Save score
	const handleSave = async () => {
		if (submitting) return;
		submitting = true;
		try {
			const thread = store.currentThread;
			const tsStr = thread?.timeSignature || '4/4';
			const [beats, beatValue] = tsStr.split('/').map(Number);
			const ts = { beats: beats || 4, beatValue: beatValue || 4 };
			const prBars = scoreToPianoRoll(scoreEditorValue, ts, thread?.bpm || 120);
			const midiData = pianoRollBarsToBase64(prBars, thread?.bpm || 120, ts);
			await store.saveScore(threadId, { score: scoreEditorValue, comment: commentInput.trim(), midiData });
			commentInput = '';
			player?.dispose();
			player = null;
			// Reload history to reflect the new save
			historyItems = await store.loadHistory(threadId);
			showToast('保存しました', 'success');
		} catch {
			showToast('保存に失敗しました', 'error');
		} finally {
			submitting = false;
		}
	};

	// Review a specific history entry (called from SessionDrawer)
	const handleReviewEntry = async (index: number): Promise<{ comment: string; scores: string }> => {
		const result = await store.requestReview(threadId);
		historyItems = await store.loadHistory(threadId);
		return result;
	};

	// Settings update
	const handleUpdateSettings = async (data: { title?: string; key?: string; timeSignature?: string; bpm?: number }) => {
		const thread = store.currentThread;
		if (!thread) return;
		const fullData = {
			title: data.title ?? '',
			key: data.key ?? thread.key,
			timeSignature: data.timeSignature ?? thread.timeSignature,
			bpm: data.bpm ?? thread.bpm,
		};
		await store.updateSettings(threadId, fullData);
	};

	// Pattern insert handler
	const handlePatternInsert = (chords: string) => {
		scoreEditorValue = scoreEditorValue
			? scoreEditorValue + '\n' + chords
			: chords;
	};

	const handleScoreChange = (value: string) => {
		scoreEditorValue = value;
	};

	// Transpose handlers (preview only)
	let transposeSemitones = $state(0);

	const handleTransposeUp = () => {
		transposeSemitones++;
		scoreEditorValue = transpose(scoreEditorValue, 1);
	};

	const handleTransposeDown = () => {
		transposeSemitones--;
		scoreEditorValue = transpose(scoreEditorValue, -1);
	};

	const handleChordSelect = (chord: string) => {
		pendingInsertText = chord + '::' + Date.now();
	};

	// Swipe-from-left-edge to go back (mobile)
	let swipeStartX = 0;
	let swipeStartY = 0;
	let swiping = $state(false);
	let swipeX = $state(0);

	const handleTouchStart = (e: TouchEvent) => {
		const touch = e.touches[0];
		if (touch.clientX < 20) {
			swipeStartX = touch.clientX;
			swipeStartY = touch.clientY;
			swiping = true;
			swipeX = 0;
		}
	};

	const handleTouchMove = (e: TouchEvent) => {
		if (!swiping) return;
		const touch = e.touches[0];
		const dx = touch.clientX - swipeStartX;
		const dy = Math.abs(touch.clientY - swipeStartY);
		// Cancel if vertical movement dominates
		if (dy > 80) { swiping = false; swipeX = 0; return; }
		swipeX = Math.max(0, dx);
	};

	const handleTouchEnd = () => {
		if (!swiping) return;
		if (swipeX > 100) {
			window.location.href = '/';
		}
		swiping = false;
		swipeX = 0;
	};

	// FAB: scroll to tools panel on mobile
	let toolsPanelEl = $state<HTMLElement | null>(null);
	let toolsInView = $state(true);

	onMount(() => {
		// (existing onMount logic is above)
	});

	$effect(() => {
		if (!toolsPanelEl) return;
		const observer = new IntersectionObserver(
			([entry]) => { toolsInView = entry.isIntersecting; },
			{ threshold: 0.1 }
		);
		observer.observe(toolsPanelEl);
		return () => observer.disconnect();
	});

	const scrollToTools = () => {
		toolsPanelEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const handleInsertBar = () => {
		pendingInsertText = '| ::' + Date.now();
	};

	const handleInsertNewline = () => {
		pendingInsertText = '\n::' + Date.now();
	};

	const handleDeleteLastLine = () => {
		const lines = scoreEditorValue.split('\n');
		if (lines.length > 0) {
			lines.pop();
			scoreEditorValue = lines.join('\n');
		}
	};

	const handleDisplayModeChange = (mode: DisplayMode) => {
		scoreDisplayMode = mode;
	};

	const handleCommentChange = (value: string) => {
		commentInput = value;
	};

	const handleRestoreScore = (score: string) => {
		scoreEditorValue = score;
	};

	const handleOpenImport = () => { importModalOpen = true; };

	const handleImportConfirm = (chords: string, meta: { bpm: number; timeSignature: string; key: string }) => {
		scoreEditorValue = scoreEditorValue.trim()
			? scoreEditorValue + '\n\n' + chords
			: chords;
		importModalOpen = false;
		// Update session settings with import meta
		const updates: { bpm?: number; timeSignature?: string; key?: string } = {};
		if (meta.bpm > 0) updates.bpm = meta.bpm;
		if (meta.timeSignature) updates.timeSignature = meta.timeSignature;
		if (meta.key) updates.key = meta.key;
		if (Object.keys(updates).length > 0) {
			handleUpdateSettings(updates);
		}
		buildPlayer();
	};
</script>

<svelte:window onkeydown={handleKeydown} />

{#if swiping}
	<div class="swipe-back-indicator" style:opacity={Math.min(1, swipeX / 100)}>
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="15,18 9,12 15,6" />
		</svg>
	</div>
{/if}

<svelte:head>
	<title>{store.currentThread?.title || 'Thread'} - Tamekoma Night</title>
</svelte:head>

<div
	class="page"
	class:page--swiping={swiping}
	style:transform={swiping ? `translateX(${swipeX}px)` : ''}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
>
	{#if store.currentThread}
		{@const thread = store.currentThread}

		<ThreadHeader
			{thread}
			{drawerOpen}
			error={store.error}
			{submitting}
			{hasChanges}
			visibility={thread.visibility || 'private'}
			onOpenLog={toggleDrawer}
			onExport={handleExport}
			onExportText={handleExportText}
			onSave={handleSave}
			onShare={handleShare}
			onDelete={handleDelete}
			onUpdateSettings={handleUpdateSettings}
		/>

		<!-- Main editor layout: Score (main) + Tools (sidebar) -->
		<div class="editor-layout">
			<div class="panel-score">
				<ScorePanel
					{thread}
					{scoreEditorValue}
					{activeBarIndex}
					{scoreDisplayMode}
					{transposeSemitones}
					{pendingInsertText}
					{annotations}
					onScoreChange={handleScoreChange}
					onImport={handleOpenImport}
					onTransposeUp={handleTransposeUp}
					onTransposeDown={handleTransposeDown}
					onDisplayModeChange={handleDisplayModeChange}
					onInsertBar={handleInsertBar}
					onInsertNewline={handleInsertNewline}
					onDeleteLastLine={handleDeleteLastLine}
					onReaction={handleReaction}
					onRangeComment={handleRangeComment}
					onAiAnalyze={handleAiAnalyze}
				/>
			</div>

			<div class="panel-tools" bind:this={toolsPanelEl}>
				<ToolsPanel
					{thread}
					canAct={true}
					scoreReadonly={false}
					onChordSelect={handleChordSelect}
					onPatternInsert={handlePatternInsert}
				/>
			</div>
		</div>
	{:else if store.loading}
		<div class="loading">
			<div class="loading-spinner"></div>
			<p>Loading thread...</p>
		</div>
	{:else if store.error}
		<div class="error-page">
			<div class="error-card">
				<div class="error-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
				</div>
				<h2>{store.error === '403' ? 'アクセス権限がありません' : 'スレッドが見つかりません'}</h2>
				<p class="error-detail">
					{store.error === '403'
						? 'このセッションにアクセスする権限がありません。オーナーに共有を依頼してください。'
						: 'このセッションは削除されたか、URLが間違っている可能性があります。'}
				</p>
				<a href="/" class="error-back-btn">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="10,2 4,8 10,14" />
					</svg>
					ホームに戻る
				</a>
			</div>
		</div>
	{/if}
</div>

{#if store.currentThread && !toolsInView}
	<button class="fab-scroll-tools" onclick={scrollToTools} aria-label="ツールパネルへスクロール">
		<span class="fab-icon">+</span>
	</button>
{/if}

{#if store.currentThread}
	{@const thread2 = store.currentThread}
	<ImportModal
		open={importModalOpen}
		threadId={threadId}
		initialBpm={thread2.bpm}
		initialTimeSignature={thread2.timeSignature}
		initialKey={thread2.key}
		onclose={() => { importModalOpen = false; }}
		onconfirm={handleImportConfirm}
	/>
	<ShareModal
		open={shareModalOpen}
		threadId={threadId}
		currentVisibility={thread2.visibility || 'private'}
		currentSharedWith={thread2.sharedWith || []}
		onclose={() => { shareModalOpen = false; }}
		onupdate={handleShareUpdate}
	/>
	<SessionDrawer
		history={historyItems}
		open={drawerOpen}
		onClose={closeDrawer}
		{comments}
		onAddComment={handleAddComment}
		onDeleteComment={handleDeleteComment}
		currentUserId={store.user?.sub || ''}
	/>
{/if}

<PlayerBar
	playerState={selectionPlaying ? 'playing' : playerState}
	{currentTime}
	{totalDuration}
	bpm={store.currentThread?.bpm ?? 120}
	{currentChord}
	volume={playerVolume}
	loop={playerLoop}
	metronome={playerMetronome}
	voicingMode={playerVoicingMode}
	{oscPreset}
	playingNotes={currentChordNotes}
	onplay={handlePlay}
	onpause={handlePause}
	onstop={handleStop}
	onseek={handleSeek}
	onVolumeChange={handleVolumeChange}
	onLoopChange={handleLoopChange}
	onMetronomeChange={handleMetronomeChange}
	onVoicingModeChange={handleVoicingModeChange}
	onOscPresetChange={handleOscPresetChange}
/>

<!-- Delete confirmation dialog -->
{#if deleteConfirmOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => { deleteConfirmOpen = false; }}></div>
	<div class="modal delete-confirm-modal">
		<div class="modal-header">
			<h2>このスコアを削除しますか？</h2>
			<button class="modal-close" onclick={() => { deleteConfirmOpen = false; }}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="3" y1="3" x2="13" y2="13" />
					<line x1="13" y1="3" x2="3" y2="13" />
				</svg>
			</button>
		</div>
		<div class="modal-body">
			<p class="delete-warn">この操作は取り消せません</p>
		</div>
		<div class="modal-footer">
			<button class="btn-cancel" onclick={() => { deleteConfirmOpen = false; }}>キャンセル</button>
			<button class="btn-delete-confirm" onclick={confirmDelete}>削除する</button>
		</div>
	</div>
{/if}

<style>
	/* Delete confirmation modal */
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
		width: 380px;
		max-width: 90vw;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		z-index: 101;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
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
		padding: var(--space-md) var(--space-lg);
	}

	.delete-warn {
		color: var(--text-muted);
		font-size: 0.85rem;
		margin: 0;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		border-top: 1px solid var(--border-subtle);
	}

	.btn-cancel {
		padding: 6px 16px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.btn-delete-confirm {
		padding: 6px 16px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--error);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-delete-confirm:hover {
		filter: brightness(1.1);
		transform: translateY(-1px);
	}

	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--space-sm) var(--space-xl);
		padding-bottom: calc(80px + var(--space-md));
		display: flex;
		flex-direction: column;
		min-height: calc(100vh - 80px);
		box-sizing: border-box;
	}

	/* Editor layout: 2-column grid */
	.editor-layout {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: var(--space-md);
		flex: 1;
		min-height: 0;
	}

	.panel-score, .panel-tools {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--bg-base);
		overflow-y: auto;
		box-sizing: border-box;
		min-width: 0;
	}

	/* Make ScorePanel fill the panel height */
	.panel-score {
		display: flex;
		flex-direction: column;
	}

	.panel-score > :global(*) {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 900px) {
		.editor-layout {
			grid-template-columns: 1fr;
			height: auto;
		}
		.panel-score, .panel-tools {
			height: auto;
			overflow: visible;
		}
	}

	@media (max-width: 900px) and (orientation: landscape) {
		.editor-layout {
			grid-template-columns: 1fr 1fr;
			height: calc(100vh - 120px);
		}
		.panel-score {
			overflow-y: auto;
			max-height: calc(100vh - 120px);
		}
		.panel-tools {
			overflow-y: auto;
			max-height: calc(100vh - 120px);
		}
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		color: var(--text-muted);
		padding: var(--space-2xl);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading p {
		font-size: 0.85rem;
		margin: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 600px) {
		.page {
			padding: var(--space-xs) var(--space-sm);
			padding-bottom: calc(72px + var(--space-md));
		}

		.editor-layout {
			grid-template-columns: 1fr;
			gap: var(--space-xs);
		}

		.panel-score, .panel-tools {
			border-radius: var(--radius-md);
		}
	}

	.error-page {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		padding: var(--space-2xl);
	}

	.error-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-2xl) var(--space-xl);
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		text-align: center;
		max-width: 420px;
		width: 100%;
	}

	.error-page h2 {
		font-size: 1.1rem;
		color: var(--text-primary);
		margin: 0;
	}

	.error-icon {
		color: var(--text-muted);
		opacity: 0.5;
	}

	.error-detail {
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 400px;
		margin: 0;
		line-height: 1.6;
	}

	.error-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 20px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: 0.85rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.15s;
		margin-top: var(--space-sm);
	}

	.error-back-btn:hover {
		border-color: var(--accent-primary);
		color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	/* Swipe-to-go-back */
	.page--swiping {
		transition: none;
	}

	/* FAB: scroll to tools */
	.fab-scroll-tools {
		display: none;
		position: fixed;
		bottom: 96px;
		right: 16px;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: none;
		background: var(--accent-primary);
		color: #fff;
		font-size: 1.5rem;
		font-weight: 700;
		box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
		cursor: pointer;
		z-index: 49;
		transition: transform 0.15s, box-shadow 0.15s;
		align-items: center;
		justify-content: center;
	}

	.fab-scroll-tools:active {
		transform: scale(0.92);
	}

	.fab-icon {
		line-height: 1;
	}

	@media (max-width: 600px) {
		.fab-scroll-tools {
			display: flex;
		}
	}

	.swipe-back-indicator {
		position: fixed;
		top: 50%;
		left: 8px;
		transform: translateY(-50%);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--accent-primary);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		box-shadow: 0 2px 12px rgba(167, 139, 250, 0.4);
		pointer-events: none;
	}
</style>
