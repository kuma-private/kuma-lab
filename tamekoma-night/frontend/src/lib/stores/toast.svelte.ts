let toasts = $state<Array<{ id: number; message: string; type: string }>>([]);
let nextId = 0;

export function getToasts() {
	return toasts;
}

export function showToast(
	message: string,
	type: 'success' | 'error' | 'info' = 'info'
) {
	// Dedupe: if the exact same message+type is already on screen, do not
	// stack a second copy. This prevents a burst of bridge rejections (or
	// any rapid identical event) from filling the toast container with
	// duplicates that intercept clicks under it.
	const existing = toasts.find(
		(t) => t.message === message && t.type === type
	);
	if (existing) return;

	// Cap the on-screen total so distinct messages can't pile up arbitrarily
	// either. Drop the oldest when full.
	const MAX_TOASTS = 4;
	const id = nextId++;
	const next = [...toasts, { id, message, type }];
	toasts = next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 3000);
}

export function dismissToast(id: number) {
	toasts = toasts.filter((t) => t.id !== id);
}
