export interface Thread {
	id: string;
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	createdBy: string;
	createdByName: string;
	score: string;
	lastEditedBy: string;
	lastEditedAt: string;
	members: string[];
}

export interface SaveHistory {
	userId: string;
	userName: string;
	score: string;
	comment: string;
	aiComment: string;
	aiScores: string;
	createdAt: string;
}

export interface UserInfo {
	name: string;
	email: string;
	sub: string;
}

const apiFetch = async (url: string, options?: RequestInit) => {
	const res = await fetch(url, { credentials: 'include', ...options });
	if (res.status === 401) throw new Error('LOGIN_REQUIRED');
	if (!res.ok) {
		const data = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(data.error || `Error ${res.status}`);
	}
	return res;
};

export const getMe = async (): Promise<UserInfo> => {
	const res = await apiFetch('/auth/me');
	return res.json();
};

export const getThreads = async (): Promise<Thread[]> => {
	const res = await apiFetch('/api/threads');
	return res.json();
};

export const getThread = async (id: string): Promise<Thread> => {
	const res = await apiFetch(`/api/threads/${id}`);
	return res.json();
};

export const createThread = async (data: { title: string }): Promise<{ id: string }> => {
	const res = await apiFetch('/api/threads', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const saveScore = async (
	threadId: string,
	data: { score: string; comment: string }
): Promise<Thread> => {
	const res = await apiFetch(`/api/threads/${threadId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const updateSettings = async (
	threadId: string,
	data: { title?: string; key?: string; timeSignature?: string; bpm?: number }
): Promise<Thread> => {
	const res = await apiFetch(`/api/threads/${threadId}/settings`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const requestReview = async (threadId: string): Promise<{ comment: string; scores: string }> => {
	const res = await apiFetch(`/api/threads/${threadId}/review`, { method: 'POST' });
	return res.json();
};

export const getHistory = async (threadId: string): Promise<SaveHistory[]> => {
	const res = await apiFetch(`/api/threads/${threadId}/history`);
	return res.json();
};

export const transformChords = async (
	threadId: string,
	data: { selectedChords: string; instruction: string; key: string; timeSignature: string; fullScore: string }
): Promise<{ comment: string; chords: string }> => {
	const res = await apiFetch(`/api/threads/${threadId}/transform`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const importChordChart = async (
	threadId: string,
	data: { images: string[]; songName: string; artist: string; sourceUrl: string; bpm: number; timeSignature: string; key: string }
): Promise<{ chords: string }> => {
	const res = await apiFetch(`/api/threads/${threadId}/import`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const exportThread = async (threadId: string): Promise<string> => {
	const res = await apiFetch(`/api/threads/${threadId}/export`);
	return res.text();
};
