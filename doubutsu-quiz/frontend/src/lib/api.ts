import type { QuizItem } from './types';

export async function fetchQuizImages(genre: string): Promise<QuizItem[]> {
	const res = await fetch('/api/quiz/images', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ genre })
	});

	if (res.status === 401) {
		throw new Error('LOGIN_REQUIRED');
	}

	if (res.status === 429) {
		throw new Error('ちょっとまってね！');
	}

	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(data.error || `Error ${res.status}`);
	}

	const data = await res.json();
	return data.items;
}
