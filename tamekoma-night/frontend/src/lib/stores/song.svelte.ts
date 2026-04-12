import type { Song, SongListItem, Track, DirectiveBlock, Section } from '$lib/types/song';
import type {
	AutomationCurve,
	AutomationPoint,
	ChainNode,
	PluginRef,
	Send
} from '$lib/types/chain';
import type { JsonPatchOp } from '$lib/bridge/protocol';
import * as api from '$lib/api';
import { hydrateSong } from '$lib/song-serializer';
import { escapeJsonPointer } from '$lib/bridge/project-adapter';
import { bridgeStore } from '$lib/stores/bridge.svelte';
import type { PlaybackEngine } from '$lib/playback/engine';

class SongStore {
	songs = $state<SongListItem[]>([]);
	currentSong = $state<Song | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);

	private engine: PlaybackEngine | null = null;

	// ── Engine wiring ─────────────────────────────────────

	attachEngine(engine: PlaybackEngine | null): void {
		this.engine = engine;
	}

	// ── Song CRUD ─────────────────────────────────────────

	loadSongs = async (): Promise<void> => {
		this.loading = true;
		this.error = null;
		try {
			this.songs = await api.getSongs();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	};

	loadSong = async (id: string): Promise<void> => {
		this.loading = true;
		this.error = null;
		try {
			this.currentSong = hydrateSong(await api.getSong(id));
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.loading = false;
		}
	};

	createSong = async (title: string) => {
		this.loading = true;
		this.error = null;
		try {
			return await api.createSong({ title });
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			this.loading = false;
		}
	};

	saveSong = async (): Promise<void> => {
		if (!this.currentSong) return;
		this.loading = true;
		this.error = null;
		try {
			const saved = await api.updateSong(this.currentSong.id, {
				title: this.currentSong.title,
				bpm: this.currentSong.bpm,
				timeSignature: this.currentSong.timeSignature,
				key: this.currentSong.key,
				chordProgression: this.currentSong.chordProgression,
				sections: this.currentSong.sections,
				tracks: this.currentSong.tracks
			});
			this.currentSong = hydrateSong(saved);
			this.songs = this.songs.map((s) =>
				s.id === saved.id
					? {
							...s,
							title: saved.title,
							bpm: saved.bpm,
							key: saved.key,
							timeSignature: saved.timeSignature,
							lastEditedAt: saved.lastEditedAt,
							trackCount: saved.tracks.length,
							sectionCount: saved.sections.length
					  }
					: s
			);
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			this.loading = false;
		}
	};

	deleteSong = async (id: string): Promise<void> => {
		this.loading = true;
		this.error = null;
		try {
			await api.deleteSong(id);
			this.songs = this.songs.filter((s) => s.id !== id);
			if (this.currentSong?.id === id) this.currentSong = null;
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			throw e;
		} finally {
			this.loading = false;
		}
	};

	setCurrentSong = (song: Song | null): void => {
		this.currentSong = song;
	};

	clearError = (): void => {
		this.error = null;
	};

	// ── Internal updater (legacy structural updates) ──────

	private updateCurrentSong(updater: (song: Song) => Song): void {
		if (!this.currentSong) return;
		const updated = updater(this.currentSong);
		updated.lastEditedAt = new Date().toISOString();
		this.currentSong = updated;
		this.songs = this.songs.map((s) =>
			s.id === updated.id
				? {
						...s,
						title: updated.title,
						bpm: updated.bpm,
						key: updated.key,
						lastEditedAt: updated.lastEditedAt,
						trackCount: updated.tracks.length,
						sectionCount: updated.sections.length
				  }
				: s
		);
	}

	// ── Track / block / section operations ───────────────

	addTrack = (track: Track): void => {
		this.updateCurrentSong((song) => ({ ...song, tracks: [...song.tracks, track] }));
	};

	removeTrack = (trackId: string): void => {
		this.updateCurrentSong((song) => ({
			...song,
			tracks: song.tracks.filter((t) => t.id !== trackId)
		}));
	};

	updateTrack = (trackId: string, updates: Partial<Track>): void => {
		this.updateCurrentSong((song) => ({
			...song,
			tracks: song.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t))
		}));
	};

	addBlock = (trackId: string, block: DirectiveBlock): void => {
		this.updateCurrentSong((song) => ({
			...song,
			tracks: song.tracks.map((t) =>
				t.id === trackId ? { ...t, blocks: [...t.blocks, block] } : t
			)
		}));
	};

	removeBlock = (trackId: string, blockId: string): void => {
		this.updateCurrentSong((song) => ({
			...song,
			tracks: song.tracks.map((t) =>
				t.id === trackId ? { ...t, blocks: t.blocks.filter((b) => b.id !== blockId) } : t
			)
		}));
	};

	updateBlock = (trackId: string, blockId: string, updates: Partial<DirectiveBlock>): void => {
		this.updateCurrentSong((song) => ({
			...song,
			tracks: song.tracks.map((t) =>
				t.id === trackId
					? { ...t, blocks: t.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)) }
					: t
			)
		}));
	};

	addSection = (section: Section): void => {
		this.updateCurrentSong((song) => ({ ...song, sections: [...song.sections, section] }));
	};

	removeSection = (sectionId: string): void => {
		this.updateCurrentSong((song) => ({
			...song,
			sections: song.sections.filter((s) => s.id !== sectionId)
		}));
	};

	updateSection = (sectionId: string, updates: Partial<Section>): void => {
		this.updateCurrentSong((song) => ({
			...song,
			sections: song.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s))
		}));
	};

	// ── Phase 3: mutate helper ───────────────────────────

	private mutate(recipe: (draft: Song) => void, ops: JsonPatchOp[]): void {
		if (!this.currentSong) return;
		const draft = structuredClone($state.snapshot(this.currentSong)) as Song;
		recipe(draft);
		draft.lastEditedAt = new Date().toISOString();
		this.currentSong = draft;
		if (ops.length === 0) return;
		if (bridgeStore.state === 'connected') {
			bridgeStore.client.send({ type: 'project.patch', ops }).catch((e) => {
				console.warn('[song.mutate] bridge patch rejected:', e);
			});
		}
	}

	// ── Phase 3: track-level (volume/mute/solo/pan) ──────
	// These mirror to engine for real-time playback feedback (Tone-side state).

	setTrackVolume = (trackId: string, db: number): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (t) t.volume = db;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/volumeDb`,
					value: db
				}
			]
		);
		this.engine?.setTrackVolume(trackId, db);
	};

	setTrackMute = (trackId: string, mute: boolean): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (t) t.mute = mute;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/mute`,
					value: mute
				}
			]
		);
		this.engine?.setTrackMute(trackId, mute);
	};

	setTrackSolo = (trackId: string, solo: boolean): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (t) t.solo = solo;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/solo`,
					value: solo
				}
			]
		);
		this.engine?.setTrackSolo(trackId, solo);
	};

	setTrackPan = (trackId: string, pan: number): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (t) t.pan = pan;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/pan`,
					value: pan
				}
			]
		);
	};

	// ── Phase 3: chain operations ────────────────────────

	addChainNode = (trackId: string, position: number, plugin: PluginRef): string => {
		const nodeId = crypto.randomUUID();
		const node: ChainNode = {
			id: nodeId,
			kind: 'insert',
			plugin,
			bypass: false,
			params: {}
		};
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (!t) return;
				if (!t.chain) t.chain = [];
				const idx = Math.max(0, Math.min(position, t.chain.length));
				t.chain.splice(idx, 0, node);
			},
			[
				{
					op: 'add',
					path: `/tracks/${escapeJsonPointer(trackId)}/chain/-`,
					value: node
				}
			]
		);
		return nodeId;
	};

	removeChainNode = (trackId: string, nodeId: string): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (!t || !t.chain) return;
				t.chain = t.chain.filter((n) => n.id !== nodeId);
			},
			[
				{
					op: 'remove',
					path: `/tracks/${escapeJsonPointer(trackId)}/chain/${escapeJsonPointer(nodeId)}`
				}
			]
		);
	};

	setChainBypass = (trackId: string, nodeId: string, bypass: boolean): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				const n = t?.chain?.find((x) => x.id === nodeId);
				if (n) n.bypass = bypass;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/chain/${escapeJsonPointer(nodeId)}/bypass`,
					value: bypass
				}
			]
		);
	};

	setChainParam = (trackId: string, nodeId: string, paramId: string, value: number): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				const n = t?.chain?.find((x) => x.id === nodeId);
				if (n) n.params[paramId] = value;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/chain/${escapeJsonPointer(nodeId)}/params/${escapeJsonPointer(paramId)}`,
					value
				}
			]
		);
	};

	// ── Phase 3: send operations ─────────────────────────

	addSend = (trackId: string, destBusId: string, level: number, pre = false): string => {
		const sendId = crypto.randomUUID();
		const send: Send = { id: sendId, destBusId, level, pre };
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (!t) return;
				if (!t.sends) t.sends = [];
				t.sends.push(send);
			},
			[
				{
					op: 'add',
					path: `/tracks/${escapeJsonPointer(trackId)}/sends/-`,
					value: send
				}
			]
		);
		return sendId;
	};

	removeSend = (trackId: string, sendId: string): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (!t || !t.sends) return;
				t.sends = t.sends.filter((s) => s.id !== sendId);
			},
			[
				{
					op: 'remove',
					path: `/tracks/${escapeJsonPointer(trackId)}/sends/${escapeJsonPointer(sendId)}`
				}
			]
		);
	};

	setSendLevel = (trackId: string, sendId: string, level: number): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				const s = t?.sends?.find((x) => x.id === sendId);
				if (s) s.level = level;
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/sends/${escapeJsonPointer(sendId)}/level`,
					value: level
				}
			]
		);
	};

	// ── Phase 3: automation operations ───────────────────

	addAutomationPoint = (
		trackId: string,
		nodeId: string,
		paramId: string,
		tick: number,
		value: number,
		curve: AutomationCurve = 'linear'
	): string => {
		const pointId = crypto.randomUUID();
		const point: AutomationPoint = { id: pointId, tick, value, curve };
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				if (!t) return;
				if (!t.automation) t.automation = [];
				let lane = t.automation.find((a) => a.nodeId === nodeId && a.paramId === paramId);
				if (!lane) {
					lane = { nodeId, paramId, points: [] };
					t.automation.push(lane);
				}
				lane.points.push(point);
			},
			[
				{
					op: 'add',
					path: `/tracks/${escapeJsonPointer(trackId)}/automation/${escapeJsonPointer(nodeId)}/${escapeJsonPointer(paramId)}/points/-`,
					value: point
				}
			]
		);
		return pointId;
	};

	removeAutomationPoint = (
		trackId: string,
		nodeId: string,
		paramId: string,
		pointId: string
	): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				const lane = t?.automation?.find((a) => a.nodeId === nodeId && a.paramId === paramId);
				if (!lane) return;
				lane.points = lane.points.filter((p) => p.id !== pointId);
			},
			[
				{
					op: 'remove',
					path: `/tracks/${escapeJsonPointer(trackId)}/automation/${escapeJsonPointer(nodeId)}/${escapeJsonPointer(paramId)}/points/${escapeJsonPointer(pointId)}`
				}
			]
		);
	};

	moveAutomationPoint = (
		trackId: string,
		nodeId: string,
		paramId: string,
		pointId: string,
		newTick: number,
		newValue: number
	): void => {
		this.mutate(
			(draft) => {
				const t = draft.tracks.find((x) => x.id === trackId);
				const lane = t?.automation?.find((a) => a.nodeId === nodeId && a.paramId === paramId);
				const p = lane?.points.find((x) => x.id === pointId);
				if (p) {
					p.tick = newTick;
					p.value = newValue;
				}
			},
			[
				{
					op: 'replace',
					path: `/tracks/${escapeJsonPointer(trackId)}/automation/${escapeJsonPointer(nodeId)}/${escapeJsonPointer(paramId)}/points/${escapeJsonPointer(pointId)}`,
					value: { id: pointId, tick: newTick, value: newValue }
				}
			]
		);
	};

	// ── Phase 3: bus operations ──────────────────────────

	addBus = (name: string): string => {
		const busId = crypto.randomUUID();
		const bus = { id: busId, name, chain: [], sends: [], volume: 0, pan: 0 };
		this.mutate(
			(draft) => {
				if (!draft.buses) draft.buses = [];
				draft.buses.push(bus);
			},
			[{ op: 'add', path: '/buses/-', value: bus }]
		);
		return busId;
	};

	removeBus = (busId: string): void => {
		this.mutate(
			(draft) => {
				if (!draft.buses) return;
				draft.buses = draft.buses.filter((b) => b.id !== busId);
			},
			[{ op: 'remove', path: `/buses/${escapeJsonPointer(busId)}` }]
		);
	};

	setBusVolume = (busId: string, volumeDb: number): void => {
		this.mutate(
			(draft) => {
				const b = draft.buses?.find((x) => x.id === busId);
				if (b) b.volume = volumeDb;
			},
			[
				{
					op: 'replace',
					path: `/buses/${escapeJsonPointer(busId)}/volume`,
					value: volumeDb
				}
			]
		);
	};

	// ── Phase 3 / 5: batch entry for AI-returned patches ─

	applyPatch = (ops: JsonPatchOp[]): void => {
		if (!this.currentSong || ops.length === 0) return;
		const draft = structuredClone($state.snapshot(this.currentSong)) as Song;
		for (const op of ops) applyOpInPlace(draft, op);
		draft.lastEditedAt = new Date().toISOString();
		this.currentSong = draft;
		if (bridgeStore.state === 'connected') {
			bridgeStore.client.send({ type: 'project.patch', ops }).catch((e) => {
				console.warn('[song.applyPatch] bridge patch rejected:', e);
			});
		}
	};
}

// ── Local-only patch applier (RFC 6902 subset) ──────────

function applyOpInPlace(song: Song, op: JsonPatchOp): void {
	const segments = parsePointer(op.path);
	if (segments.length === 0) return;
	const last = segments[segments.length - 1];
	const parentResult = resolveContainer(song, segments.slice(0, -1));
	if (parentResult == null) return;
	const parent = parentResult.parent;
	if (parent == null) return;

	if (op.op === 'add') {
		if (Array.isArray(parent)) {
			if (last === '-') parent.push(op.value);
			else {
				const idx = Number(last);
				if (Number.isFinite(idx)) parent.splice(idx, 0, op.value);
				else parent.push(op.value);
			}
		} else {
			(parent as Record<string, unknown>)[last] = op.value;
		}
	} else if (op.op === 'remove') {
		if (Array.isArray(parent)) {
			const idx = parent.findIndex((it) => isIdMatch(it, last));
			if (idx >= 0) parent.splice(idx, 1);
		} else {
			delete (parent as Record<string, unknown>)[last];
		}
	} else if (op.op === 'replace') {
		if (Array.isArray(parent)) {
			const idx = parent.findIndex((it) => isIdMatch(it, last));
			if (idx >= 0) parent[idx] = op.value;
		} else {
			(parent as Record<string, unknown>)[last] = op.value;
		}
	}
}

function isIdMatch(item: unknown, key: string): boolean {
	return (
		typeof item === 'object' &&
		item !== null &&
		'id' in item &&
		(item as { id: unknown }).id === key
	);
}

function isAutomationLane(item: unknown): boolean {
	return (
		typeof item === 'object' &&
		item !== null &&
		'nodeId' in item &&
		'paramId' in item &&
		'points' in item
	);
}

function parsePointer(path: string): string[] {
	if (!path.startsWith('/')) return [];
	return path
		.slice(1)
		.split('/')
		.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Walk pointer segments, returning the parent container of the final
 * segment. Supports id-keyed arrays (chain/sends/tracks/buses/points)
 * and the automation lane special case where two segments (nodeId,
 * paramId) jointly identify a lane.
 */
function resolveContainer(
	root: unknown,
	segments: string[]
): { parent: unknown; remaining: string[] } | null {
	let cur: unknown = root;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (cur == null) return null;
		if (Array.isArray(cur)) {
			// Special case: automation array — segments are (nodeId, paramId)
			if (cur.length > 0 && isAutomationLane(cur[0])) {
				const next = segments[i + 1];
				const lane = cur.find(
					(it) =>
						isAutomationLane(it) &&
						(it as { nodeId: string }).nodeId === seg &&
						(it as { paramId: string }).paramId === next
				);
				if (!lane) return null;
				cur = lane;
				i++; // consume the paramId segment
				continue;
			}
			const idx = cur.findIndex((it) => isIdMatch(it, seg));
			if (idx < 0) return null;
			cur = cur[idx];
		} else if (typeof cur === 'object') {
			cur = (cur as Record<string, unknown>)[seg];
		} else {
			return null;
		}
	}
	return { parent: cur, remaining: [] };
}

// ── Singleton + factory façade ───────────────────────────

export const songStore = new SongStore();

/**
 * Backward-compatible factory for existing call sites.
 * Returns the singleton — both pages share state, which is desirable so
 * BridgeEngine and Mixer can react to song mutations from anywhere.
 */
export const createSongStore = (): SongStore => songStore;
