export interface UserInfo {
	name: string;
	email: string;
	sub: string;
	/** Subscription tier reported by backend. May be absent for older deployments; treat as 'free'. */
	tier?: 'free' | 'premium';
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
import type { MidiNote } from '$lib/types/song';

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
	notes: MidiNote[];
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

// ── Cadenza Bridge: ticket issuance ────────────────────────
import type { JsonPatchOp } from '$lib/bridge/protocol';

export interface BridgeTicketResponse {
	/** Short-lived JWT (default 10 min) that the Bridge can verify against the backend. */
	ticket: string;
	tier: 'free' | 'premium';
	/** ISO 8601 expiry timestamp. */
	expiresAt: string;
}

export const getBridgeTicket = async (): Promise<BridgeTicketResponse> => {
	const res = await apiFetch('/api/bridge/ticket', { method: 'POST' });
	return res.json();
};

// ── Mixer / Automation AI suggest ──────────────────────────

export interface MixerSuggestRequest {
	songId: string;
	prompt: string;
	/** Entire Mixer snapshot; typed loosely so the server sees exactly what the UI has. */
	mixer: unknown;
}

export interface MixerSuggestResponse {
	explanation: string;
	ops: JsonPatchOp[];
	sideEffects: string[];
}

export const suggestMixer = async (req: MixerSuggestRequest): Promise<MixerSuggestResponse> => {
	const res = await apiFetch('/api/mixer/suggest', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	});
	return res.json();
};

export interface AutomationSuggestRequest {
	trackId: string;
	nodeId: string;
	paramId: string;
	startTick: number;
	endTick: number;
	prompt: string;
	/** [bpm, beatsPerBar] */
	bpmBpb: [number, number];
}

export interface AutomationSuggestPoint {
	tick: number;
	value: number;
	curve: 'linear' | 'hold' | 'bezier';
}

export interface AutomationSuggestResponse {
	explanation: string;
	points: AutomationSuggestPoint[];
}

export const suggestAutomation = async (
	req: AutomationSuggestRequest
): Promise<AutomationSuggestResponse> => {
	const res = await apiFetch('/api/automation/suggest', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	});
	return res.json();
};
