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

// AI Suggest / Arrange
export interface SuggestDirectivesRequest {
	chordProgression: string;
	genre: string;
	trackName: string;
	instrument: string;
	barRange: string;
}

export interface ArrangeRequest {
	chordProgression: string;
	genre: string;
	key: string;
	bpm: number;
}

export interface ArrangeResponse {
	tracks: {
		name: string;
		instrument: string;
		blocks: { startBar: number; endBar: number; directives: string }[];
	}[];
}

export const suggestDirectives = async (songId: string, data: SuggestDirectivesRequest): Promise<{ directives: string }> => {
	const res = await apiFetch(`/api/songs/${songId}/suggest`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

export const suggestArrangement = async (songId: string, data: ArrangeRequest): Promise<ArrangeResponse> => {
	const res = await apiFetch(`/api/songs/${songId}/arrange`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};

// AI MIDI Generation

export interface GenerateMidiRequest {
	chordProgression: string;
	style: string;
	instrument: string;
	bpm: number;
	expression: number;
	feel: number;
	barRange: string;
}

export interface GenerateMidiResponse {
	notes: any[];           // APIレスポンスの生の形式
	controlChanges?: any[]; // CC イベント
	style: string;
	expression: number;
	feel: number;
}

export const generateMidi = async (songId: string, data: GenerateMidiRequest): Promise<GenerateMidiResponse> => {
	const res = await apiFetch(`/api/songs/${songId}/generate-midi`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data)
	});
	return res.json();
};
