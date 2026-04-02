let toasts = $state<Array<{id: number; message: string; type: string}>>([]);
let nextId = 0;

export function getToasts() { return toasts; }
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const id = nextId++;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 3000);
}
export function dismissToast(id: number) {
    toasts = toasts.filter(t => t.id !== id);
}
