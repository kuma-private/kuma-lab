import type { GenerateResponse } from './state/types';

export async function generate(): Promise<GenerateResponse> {
	const res = await fetch('/api/generate', { method: 'POST' });
	if (!res.ok) {
		if (res.status === 401) throw new Error('ログインが必要です');
		if (res.status === 429) throw new Error('リクエスト制限に達しました。少々お待ちください');
		throw new Error('サーバーエラーが発生しました');
	}
	return res.json();
}
