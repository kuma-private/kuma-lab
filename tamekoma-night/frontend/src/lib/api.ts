export interface Thread {
	id: string;
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	createdBy: string;
	createdByName: string;
	score: string;
	midiData?: string;
	lastEditedBy: string;
	lastEditedAt: string;
	members: string[];
	visibility: string;
	sharedWith: string[];
	editorMode?: string;
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

export const deleteThread = async (threadId: string): Promise<void> => {
	await apiFetch(`/api/threads/${threadId}`, { method: 'DELETE' });
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
	data: { score: string; comment: string; midiData?: string }
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
	data: { title?: string; key?: string; timeSignature?: string; bpm?: number; editorMode?: string }
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

// Share
export const shareThread = async (
	threadId: string,
	data: { visibility: string; sharedWith: string[] }
): Promise<Thread> => {
	const res = await apiFetch(`/api/threads/${threadId}/share`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

// Comments
export interface Comment {
	id: string;
	userId: string;
	userName: string;
	text: string;
	anchorType: string;
	anchorStart: number;
	anchorEnd: number;
	anchorSnapshot: string;
	createdAt: string;
}

export const addComment = async (
	threadId: string,
	data: { text: string; anchorType: string; anchorStart: number; anchorEnd: number; anchorSnapshot: string }
): Promise<Comment> => {
	const res = await apiFetch(`/api/threads/${threadId}/comments`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const getComments = async (threadId: string): Promise<Comment[]> => {
	const res = await apiFetch(`/api/threads/${threadId}/comments`);
	return res.json();
};

export const deleteComment = async (threadId: string, commentId: string): Promise<void> => {
	await apiFetch(`/api/threads/${threadId}/comments/${commentId}`, { method: 'DELETE' });
};

// Annotations
export interface Annotation {
	id: string;
	userId: string;
	userName: string;
	type: string;
	startBar: number;
	endBar: number;
	snapshot: string;
	emoji: string;
	aiComment: string;
	createdAt: string;
}

export const addAnnotation = async (
	threadId: string,
	data: { annotationType: string; startBar: number; endBar: number; snapshot: string; emoji: string }
): Promise<Annotation> => {
	const res = await apiFetch(`/api/threads/${threadId}/annotations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const getAnnotations = async (threadId: string): Promise<Annotation[]> => {
	const res = await apiFetch(`/api/threads/${threadId}/annotations`);
	return res.json();
};

export const deleteAnnotation = async (threadId: string, annotationId: string): Promise<void> => {
	await apiFetch(`/api/threads/${threadId}/annotations/${annotationId}`, { method: 'DELETE' });
};

export const analyzeSelection = async (
	threadId: string,
	data: { selectedChords: string; fullScore: string; key: string; timeSignature: string }
): Promise<Annotation> => {
	const res = await apiFetch(`/api/threads/${threadId}/analyze-selection`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

// Song API
import type { Song, SongListItem, Section, Track } from '$lib/types/song';

export interface UpdateSongData {
	title: string;
	bpm: number;
	timeSignature: string;
	key: string;
	chordProgression: string;
	sections: Section[];
	tracks: Track[];
}

export const getSongs = async (): Promise<SongListItem[]> => {
	const res = await apiFetch('/api/songs');
	return res.json();
};

export const getSong = async (id: string): Promise<Song> => {
	const res = await apiFetch(`/api/songs/${id}`);
	return res.json();
};

export const createSong = async (data: { title: string }): Promise<{ id: string }> => {
	const res = await apiFetch('/api/songs', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const updateSong = async (id: string, data: UpdateSongData): Promise<Song> => {
	const res = await apiFetch(`/api/songs/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const deleteSong = async (id: string): Promise<void> => {
	await apiFetch(`/api/songs/${id}`, { method: 'DELETE' });
};
