<script lang="ts">
    import { getToasts, dismissToast } from '$lib/stores/toast.svelte';

    const toasts = $derived(getToasts());
</script>

<div class="toast-container">
    {#each toasts as toast (toast.id)}
        <div class="toast toast--{toast.type}">
            <span>{toast.message}</span>
            <button class="toast-dismiss" aria-label="通知を閉じる" onclick={() => dismissToast(toast.id)}>&#x2715;</button>
        </div>
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: calc(var(--player-height) + var(--space-sm));
        left: 50%;
        transform: translateX(-50%);
        z-index: var(--z-toast);
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        width: 90%;
        max-width: 400px;
    }

    .toast {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 16px;
        border-radius: var(--radius-md);
        font-size: 0.82rem;
        pointer-events: auto;
        animation: toast-in 0.2s ease-out;
        box-shadow: var(--shadow-elevated);
    }

    .toast--success {
        background: rgba(52, 211, 153, 0.15);
        border: 1px solid var(--success);
        color: var(--success);
    }

    .toast--error {
        background: rgba(248, 113, 113, 0.15);
        border: 1px solid var(--error);
        color: var(--error);
    }

    .toast--info {
        background: rgba(232, 168, 76, 0.15);
        border: 1px solid var(--accent-primary);
        color: var(--accent-primary);
    }

    .toast-dismiss {
        background: none;
        border: none;
        color: inherit;
        opacity: 0.6;
        cursor: pointer;
        padding: 2px;
        font-size: 0.75rem;
    }

    .toast-dismiss:hover {
        opacity: 1;
    }

    @keyframes toast-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
