<script lang="ts">
	import { shareThread } from '$lib/api';

	interface Props {
		open: boolean;
		threadId: string;
		currentVisibility: string;
		currentSharedWith: string[];
		onclose: () => void;
		onupdate: (visibility: string, sharedWith: string[]) => void;
	}

	let {
		open,
		threadId,
		currentVisibility,
		currentSharedWith,
		onclose,
		onupdate,
	}: Props = $props();

	let visibility = $state('private');
	let sharedWith = $state<string[]>([]);
	let emailInput = $state('');
	let emailError = $state('');
	let saving = $state(false);
	let urlCopied = $state(false);
	let canNativeShare = $state(false);

	$effect(() => {
		canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
	});

	$effect(() => {
		if (open) {
			visibility = currentVisibility || 'private';
			sharedWith = [...(currentSharedWith || [])];
			emailInput = '';
		}
	});

	const addEmail = () => {
		const email = emailInput.trim();
		if (!email) { emailInput = ''; return; }
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			emailError = '有効なメールアドレスを入力してください';
			return;
		}
		emailError = '';
		if (!sharedWith.includes(email)) {
			sharedWith = [...sharedWith, email];
		}
		emailInput = '';
	};

	const copyUrl = async () => {
		const url = window.location.origin + '/thread/' + threadId;
		await navigator.clipboard.writeText(url);
		urlCopied = true;
		setTimeout(() => { urlCopied = false; }, 2000);
	};

	const nativeShare = async () => {
		const url = window.location.origin + '/thread/' + threadId;
		try {
			await navigator.share({ title: 'Tamekoma Night', url });
		} catch {
			// User cancelled or share failed, fall back to copy
			await copyUrl();
		}
	};

	const removeEmail = (email: string) => {
		sharedWith = sharedWith.filter(e => e !== email);
	};

	const handleSave = async () => {
		saving = true;
		try {
			await shareThread(threadId, { visibility, sharedWith });
			onupdate(visibility, sharedWith);
			onclose();
		} finally {
			saving = false;
		}
	};

	const handleEscape = (e: KeyboardEvent) => {
		if (open && e.key === 'Escape') onclose();
	};

	const handleKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && !e.isComposing) {
			e.preventDefault();
			addEmail();
		}
	};
</script>

<svelte:window onkeydown={handleEscape} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if open}
	<div class="modal-overlay" onclick={onclose}></div>
	<div class="modal">
		<div class="modal-header">
			<h2>共有設定</h2>
			<button class="modal-close" onclick={onclose}>
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="3" y1="3" x2="13" y2="13" />
					<line x1="13" y1="3" x2="3" y2="13" />
				</svg>
			</button>
		</div>

		<div class="modal-body">
			<div class="radio-group">
				<label class="radio-option" class:radio-option--active={visibility === 'private'}>
					<input type="radio" bind:group={visibility} value="private" autofocus />
					<span class="radio-icon">&#128274;</span>
					<div class="radio-text">
						<span class="radio-label">自分だけ</span>
						<span class="radio-desc">あなたのみ閲覧・編集できます</span>
					</div>
				</label>
				<label class="radio-option" class:radio-option--active={visibility === 'shared'}>
					<input type="radio" bind:group={visibility} value="shared" />
					<span class="radio-icon">&#128101;</span>
					<div class="radio-text">
						<span class="radio-label">特定ユーザー</span>
						<span class="radio-desc">指定したユーザーが閲覧・編集できます</span>
					</div>
				</label>
				<label class="radio-option" class:radio-option--active={visibility === 'public'}>
					<input type="radio" bind:group={visibility} value="public" />
					<span class="radio-icon">&#127760;</span>
					<div class="radio-text">
						<span class="radio-label">全員に公開</span>
						<span class="radio-desc">リンクを知っている全員が閲覧できます</span>
					</div>
				</label>
			</div>

			{#if visibility === 'public'}
				<div class="url-copy-section">
					{#if canNativeShare}
						<button class="btn-copy-url btn-native-share" onclick={nativeShare}>
							共有...
						</button>
					{/if}
					<button class="btn-copy-url" onclick={copyUrl}>
						{#if urlCopied}
							コピーしました
						{:else}
							URLをコピー
						{/if}
					</button>
				</div>
			{/if}

			{#if visibility === 'shared'}
				<div class="shared-section">
					<div class="email-input-row">
						<input
							class="email-input"
							type="email"
							placeholder="メールアドレスを入力"
							bind:value={emailInput}
							onkeydown={handleKeydown}
						/>
						<button class="btn-add" onclick={addEmail} disabled={!emailInput.trim()}>追加</button>
					</div>
					{#if emailError}
						<p class="email-error">{emailError}</p>
					{/if}
					{#if sharedWith.length > 0}
						<ul class="shared-list">
							{#each sharedWith as email}
								<li class="shared-item">
									<span class="shared-email">{email}</span>
									<button class="btn-remove" onclick={() => removeEmail(email)} title="削除">
										<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
											<line x1="3" y1="3" x2="13" y2="13" />
											<line x1="13" y1="3" x2="3" y2="13" />
										</svg>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			<button class="btn-cancel" onclick={onclose}>キャンセル</button>
			<button class="btn-save" onclick={handleSave} disabled={saving}>
				{#if saving}
					<span class="spinner-sm"></span>
				{/if}
				保存
			</button>
		</div>
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
		width: 420px;
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
		padding: var(--space-lg);
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.radio-option {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s;
	}

	.radio-option:hover {
		border-color: var(--border-default);
		background: var(--bg-elevated);
	}

	.radio-option--active {
		border-color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.08);
	}

	.radio-option input[type="radio"] {
		display: none;
	}

	.radio-icon {
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.radio-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.radio-label {
		font-size: 0.85rem;
		color: var(--text-primary);
		font-weight: 500;
	}

	.radio-desc {
		font-size: 0.72rem;
		color: var(--text-muted);
		font-weight: 400;
	}

	.url-copy-section {
		margin-top: var(--space-sm);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.btn-native-share {
		background: var(--accent-primary);
		color: #fff;
		border-color: var(--accent-primary);
	}

	.btn-native-share:hover {
		background: var(--accent-secondary);
	}

	.btn-copy-url {
		width: 100%;
		padding: 8px 16px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-md);
		background: rgba(167, 139, 250, 0.1);
		color: var(--accent-primary);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-copy-url:hover {
		background: rgba(167, 139, 250, 0.2);
	}

	.email-error {
		font-size: 0.72rem;
		color: var(--error, #f87171);
		margin: 2px 0 0;
	}

	.shared-section {
		margin-top: var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.email-input-row {
		display: flex;
		gap: var(--space-sm);
	}

	.email-input {
		flex: 1;
		padding: 6px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--bg-base);
		color: var(--text-primary);
		font-size: 0.82rem;
		outline: none;
		transition: border-color 0.15s;
	}

	.email-input:focus {
		border-color: var(--accent-primary);
	}

	.btn-add {
		padding: 6px 14px;
		border: 1px solid var(--accent-primary);
		border-radius: var(--radius-sm);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.btn-add:hover:not(:disabled) {
		background: var(--accent-secondary);
	}

	.btn-add:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.shared-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.shared-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px var(--space-sm);
		background: var(--bg-elevated);
		border-radius: var(--radius-sm);
	}

	.shared-email {
		font-size: 0.78rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}

	.btn-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-remove:hover {
		background: rgba(248, 113, 113, 0.15);
		color: var(--error);
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
		background: transparent;
		color: var(--text-secondary);
		font-size: 0.82rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel:hover {
		border-color: var(--text-muted);
		color: var(--text-primary);
	}

	.btn-save {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 20px;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent-primary);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-save:hover:not(:disabled) {
		background: var(--accent-secondary);
	}

	.btn-save:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.spinner-sm {
		width: 12px;
		height: 12px;
		border: 1.5px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 600px) {
		.modal {
			width: 95vw;
		}

		.radio-option {
			padding: var(--space-md);
		}

		.btn-remove {
			width: 32px;
			height: 32px;
		}
	}
</style>
