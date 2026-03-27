import type { GenerateResponse } from './state/types';

export async function generate(): Promise<GenerateResponse> {
	const res = await fetch('/api/generate', { method: 'POST' });
	if (!res.ok) {
		if (res.status === 401) throw new Error('ログインが必要です');
		if (res.status === 429) throw new Error('リクエスト制限に達しました。少々お待ちください');
		const body = await res.json().catch(() => ({}));
		const detail = body?.error ?? `status ${res.status}`;
		console.error('[api/generate]', res.status, detail);
		throw new Error(`サーバーエラー: ${detail}`);
	}
	return res.json();
}
