export interface Line {
	lineNumber: number;
	chords: string;
	addedBy: string;
	addedByName: string;
	lastEditedBy: string;
}

export interface TurnAction {
	turnNumber: number;
	userId: string;
	userName: string;
	action: 'add' | 'edit' | 'delete';
	lineNumber: number;
	chords: string;
	previousChords: string;
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
	status: string;
	currentTurn: string;
	lineCount: number;
	turnCount: number;
}

export interface Thread {
	id: string;
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	createdBy: string;
	createdByName: string;
	opponentId: string;
	opponentName: string;
	opponentEmail: string;
	createdAt: string;
	status: string;
	currentTurn: string;
	turnCount: number;
	finishProposedBy: string;
	lines: Line[];
	history: TurnAction[];
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
	opponentEmail: string;
}): Promise<{ id: string }> {
	const res = await apiFetch('/api/threads', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function joinThread(threadId: string): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/join`, { method: 'POST' });
	return res.json();
}

export async function submitTurn(
	threadId: string,
	data: { action: string; lineNumber: number; chords: string; comment: string }
): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/turn`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
}

export async function proposeFinish(threadId: string): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/propose-finish`, { method: 'POST' });
	return res.json();
}

export async function acceptFinish(threadId: string): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/accept-finish`, { method: 'POST' });
	return res.json();
}

export async function rejectFinish(threadId: string): Promise<{ ok: boolean }> {
	const res = await apiFetch(`/api/threads/${threadId}/reject-finish`, { method: 'POST' });
	return res.json();
}

export async function exportThread(threadId: string): Promise<string> {
	const res = await apiFetch(`/api/threads/${threadId}/export`);
	return res.text();
}
