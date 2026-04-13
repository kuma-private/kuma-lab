import type {
	QuizItem,
	EhonStory,
	EhonGenerateRequest,
	EhonPage,
	EhonMode,
	NazenazeStory,
	NazenazeGenerateRequest
} from './types';

export async function generateNazenaze(req: NazenazeGenerateRequest): Promise<NazenazeStory> {
	const res = await fetch('/api/nazenaze/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(req)
	});

	if (res.status === 401) {
		throw new Error('LOGIN_REQUIRED');
	}

	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
		throw new Error(data.error || `Nazenaze generate failed: ${res.status}`);
	}

	return res.json();
}

export async function generateEhon(req: EhonGenerateRequest): Promise<EhonStory> {
	const res = await fetch('/api/ehon/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(req)
	});

	if (res.status === 401) {
		throw new Error('LOGIN_REQUIRED');
	}

	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
		throw new Error(data.error || `Ehon generate failed: ${res.status}`);
	}

	return res.json();
}

export interface EhonStreamCallbacks {
	onTitle: (title: string, totalPages: number, aspectRatio: string, mode: EhonMode) => void;
	onPage: (page: EhonPage) => void;
	onDone: () => void;
	onError: (err: string) => void;
}

/**
 * Phase A pseudo-streaming client. Consumes the backend /api/ehon/generate-stream
 * SSE response via fetch + ReadableStream (EventSource cannot POST a body).
 * Emits title / page / done / error events through the supplied callbacks.
 */
export async function generateEhonStream(
	req: EhonGenerateRequest,
	cb: EhonStreamCallbacks
): Promise<void> {
	let resp: Response;
	try {
		resp = await fetch('/api/ehon/generate-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(req)
		});
	} catch (e) {
		cb.onError(e instanceof Error ? e.message : 'network error');
		return;
	}

	if (resp.status === 401) {
		cb.onError('LOGIN_REQUIRED');
		return;
	}
	if (!resp.ok) {
		cb.onError(`HTTP ${resp.status}`);
		return;
	}
	if (!resp.body) {
		cb.onError('no body');
		return;
	}

	const reader = resp.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let sawError = false;
	let sawDone = false;

	const handleChunk = (chunk: string) => {
		const lines = chunk.split('\n');
		let eventName = 'message';
		let data = '';
		for (const line of lines) {
			if (line.startsWith('event:')) eventName = line.slice(6).trim();
			else if (line.startsWith('data:')) data += line.slice(5).trim();
		}
		if (!data) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch (e) {
			console.warn('[ehon-sse] parse error', e, data);
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const p = parsed as any;
		if (eventName === 'title') {
			cb.onTitle(
				p.title ?? '',
				p.totalPages ?? 0,
				p.aspectRatio ?? '3:4',
				(p.mode ?? 'cosmos') as EhonMode
			);
		} else if (eventName === 'page') {
			cb.onPage(p as EhonPage);
		} else if (eventName === 'done') {
			sawDone = true;
			cb.onDone();
		} else if (eventName === 'error') {
			sawError = true;
			cb.onError((p.error as string) ?? 'unknown');
		}
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			// SSE events separated by double newline.
			const chunks = buffer.split('\n\n');
			buffer = chunks.pop() ?? '';
			for (const chunk of chunks) {
				if (chunk.length > 0) handleChunk(chunk);
			}
		}
		// Flush trailing buffer, if any.
		if (buffer.length > 0) handleChunk(buffer);
	} catch (e) {
		cb.onError(e instanceof Error ? e.message : 'stream read error');
		return;
	}

	if (!sawDone && !sawError) {
		// Stream ended without explicit done — still mark complete.
		cb.onDone();
	}
}

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
