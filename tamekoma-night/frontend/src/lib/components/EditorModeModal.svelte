<script lang="ts">
	interface Props {
		open: boolean;
		onSelect: (mode: 'chord' | 'pianoroll') => void;
	}

	let { open, onSelect }: Props = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={() => {}}></div>
	<div class="modal">
		<div class="modal-header">
			<h2>エディタを選択してください</h2>
		</div>
		<div class="modal-body">
			<div class="mode-cards">
				<button class="mode-card" onclick={() => onSelect('chord')}>
					<div class="mode-icon">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="16 18 22 12 16 6" />
							<polyline points="8 6 2 12 8 18" />
						</svg>
					</div>
					<div class="mode-label">コードエディタ</div>
					<div class="mode-desc">テキストでコード進行を素早く入力できます</div>
				</button>
				<button class="mode-card" onclick={() => onSelect('pianoroll')}>
					<div class="mode-icon">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<rect x="2" y="3" width="20" height="4" rx="1" />
							<rect x="6" y="10" width="12" height="4" rx="1" />
							<rect x="4" y="17" width="16" height="4" rx="1" />
						</svg>
					</div>
					<div class="mode-label">ピアノロール</div>
					<div class="mode-desc">ノート単位で細かく編集できます</div>
				</button>
			</div>
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
		width: 480px;
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
		padding: var(--space-lg) var(--space-lg) var(--space-sm);
		text-align: center;
	}

	.modal-header h2 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-body {
		padding: var(--space-sm) var(--space-lg) var(--space-lg);
	}

	.mode-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-md);
	}

	.mode-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-lg) var(--space-md);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--bg-base);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: center;
	}

	.mode-card:hover {
		border-color: var(--accent-primary);
		background: rgba(167, 139, 250, 0.06);
		color: var(--text-primary);
		transform: translateY(-2px);
		box-shadow: 0 4px 16px rgba(167, 139, 250, 0.15);
	}

	.mode-icon {
		color: var(--accent-primary);
		opacity: 0.8;
	}

	.mode-card:hover .mode-icon {
		opacity: 1;
	}

	.mode-label {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.mode-desc {
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	@media (max-width: 480px) {
		.mode-cards {
			grid-template-columns: 1fr;
		}
	}
</style>
