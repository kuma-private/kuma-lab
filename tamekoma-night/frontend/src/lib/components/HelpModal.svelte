<script lang="ts">
    interface Props {
        open: boolean;
        onclose: () => void;
    }
    let { open, onclose }: Props = $props();
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') onclose(); }} />

{#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="help-overlay" onclick={onclose}></div>
    <div class="help-modal">
        <div class="help-header">
            <h2>ヘルプ</h2>
            <button class="help-close" onclick={onclose}>&#x2715;</button>
        </div>
        <div class="help-body">
            <section>
                <h3>キーボードショートカット</h3>
                <div class="shortcut-list">
                    <div class="shortcut"><kbd>Space</kbd><span>再生 / 一時停止</span></div>
                    <div class="shortcut"><kbd>&#x2190;</kbd><span>5秒戻る</span></div>
                    <div class="shortcut"><kbd>&#x2192;</kbd><span>5秒進む</span></div>
                    <div class="shortcut"><kbd>Ctrl+S</kbd><span>保存</span></div>
                </div>
            </section>
            <section>
                <h3>コード記法</h3>
                <div class="notation-list">
                    <div class="notation"><code>| Am7 | Dm7 G7 |</code><span>小節とコード</span></div>
                    <div class="notation"><code>-</code><span>前のコードを伸ばす</span></div>
                    <div class="notation"><code>_</code><span>休符</span></div>
                    <div class="notation"><code>%</code><span>前の小節を繰り返す</span></div>
                    <div class="notation"><code>// サビ</code><span>セクション名</span></div>
                    <div class="notation"><code>Am7/G</code><span>オンコード</span></div>
                </div>
            </section>
            <section>
                <h3>モバイル操作</h3>
                <div class="notation-list">
                    <div class="notation"><span>削除モード</span><span>コードをタップで削除</span></div>
                    <div class="notation"><span>並替モード</span><span>2つ選んで入れ替え</span></div>
                    <div class="notation"><span>選択再生</span><span>タップ位置から再生</span></div>
                </div>
            </section>
        </div>
    </div>
{/if}

<style>
    .help-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 300;
        backdrop-filter: blur(4px);
    }

    .help-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 301;
        background: var(--bg-surface);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 480px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }

    .help-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-md) var(--space-lg);
        border-bottom: 1px solid var(--border-subtle);
    }

    .help-header h2 {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .help-close {
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 1rem;
        cursor: pointer;
        padding: 4px;
        border-radius: var(--radius-sm);
        transition: all 0.15s;
    }

    .help-close:hover {
        color: var(--text-primary);
        background: var(--bg-hover);
    }

    .help-body {
        padding: var(--space-md) var(--space-lg);
        display: flex;
        flex-direction: column;
        gap: var(--space-lg);
    }

    .help-body section h3 {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--accent-primary);
        margin: 0 0 var(--space-sm) 0;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .shortcut-list, .notation-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .shortcut, .notation {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md);
        padding: 6px 8px;
        border-radius: var(--radius-sm);
        background: var(--bg-base);
    }

    .shortcut kbd {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-primary);
        background: var(--bg-elevated);
        border: 1px solid var(--border-default);
        border-radius: 4px;
        padding: 2px 8px;
        min-width: 60px;
        text-align: center;
    }

    .shortcut span, .notation span:last-child {
        font-size: 0.78rem;
        color: var(--text-secondary);
    }

    .notation code {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        color: var(--accent-primary);
        background: var(--bg-elevated);
        padding: 2px 6px;
        border-radius: 3px;
    }

    .notation span:first-child:not(:last-child) {
        font-size: 0.78rem;
        color: var(--text-primary);
        font-weight: 500;
    }
</style>
