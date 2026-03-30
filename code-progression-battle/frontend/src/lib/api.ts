export interface Post {
	userId: string;
	userName: string;
	chords: string;
	comment: string;
	createdAt: string;
}

export interface ThreadSummary {
	id: string;
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	createdByName: string;
	createdAt: string;
	postCount: number;
}

export interface Thread {
	id: string;
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	createdBy: string;
	createdByName: string;
	createdAt: string;
	posts: Post[];
}

export interface UserInfo {
	name: string;
	email: string;
	sub: string;
}

async function apiFetch(url: string, options?: RequestInit) {
	const res = await fetch(url, { credentials: 'include', ...options });
	if (res.status === 401) throw new Error('LOGIN_REQUIRED');
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(data.error || `Error ${res.status}`);
	}
	return res;
}

export async function getMe(): Promise<UserInfo> {
	const res = await apiFetch('/auth/me');
	return res.json();
}

export async function getThreads(): Promise<ThreadSummary[]> {
	const res = await apiFetch('/api/threads');
	return res.json();
}

export async function getThread(id: string): Promise<Thread> {
	const res = await apiFetch(`/api/threads/${id}`);
	return res.json();
}

export async function createThread(data: {
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
}): Promise<{ id: string }> {
	const res = await apiFetch('/api/threads', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function addPost(
	threadId: string,
	data: { chords: string; comment: string }
): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/posts`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function exportThread(threadId: string): Promise<string> {
	const res = await apiFetch(`/api/threads/${threadId}/export`);
	return res.text();
}
