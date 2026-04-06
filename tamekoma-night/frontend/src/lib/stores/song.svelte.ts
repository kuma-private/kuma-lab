import type { Song, Track, DirectiveBlock, Section } from '$lib/types/song';
import * as api from '$lib/api';

export const createSongStore = () => {
	let songs = $state<Song[]>([]);
	let currentSong = $state<Song | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const updateCurrentSong = (updater: (song: Song) => Song) => {
		if (!currentSong) return;
		const updated = updater(currentSong);
		updated.lastEditedAt = new Date().toISOString();
		currentSong = updated;
		songs = songs.map((s) => (s.id === updated.id ? updated : s));
	};

	return {
		get songs() { return songs; },
		get currentSong() { return currentSong; },
		get loading() { return loading; },
		get error() { return error; },

		// Song CRUD — API連携
		loadSongs: async () => {
			loading = true;
			error = null;
			try {
				songs = await api.getSongs();
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			} finally {
				loading = false;
			}
		},

		loadSong: async (id: string) => {
			loading = true;
			error = null;
			try {
				currentSong = await api.getSong(id);
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			} finally {
				loading = false;
			}
		},

		createSong: async (title: string) => {
			loading = true;
			error = null;
			try {
				const result = await api.createSong({ title });
				return result;
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
				throw e;
			} finally {
				loading = false;
			}
		},

		saveSong: async () => {
			if (!currentSong) return;
			loading = true;
			error = null;
			try {
				const saved = await api.updateSong(currentSong.id, {
					title: currentSong.title,
					bpm: currentSong.bpm,
					timeSignature: currentSong.timeSignature,
					key: currentSong.key,
					chordProgression: currentSong.chordProgression,
					sections: currentSong.sections,
					tracks: currentSong.tracks,
				});
				currentSong = saved;
				songs = songs.map((s) => (s.id === saved.id ? saved : s));
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
				throw e;
			} finally {
				loading = false;
			}
		},

		deleteSong: async (id: string) => {
			loading = true;
			error = null;
			try {
				await api.deleteSong(id);
				songs = songs.filter((s) => s.id !== id);
				if (currentSong?.id === id) {
					currentSong = null;
				}
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
				throw e;
			} finally {
				loading = false;
			}
		},

		setCurrentSong: (song: Song | null) => {
			currentSong = song;
		},

		// トラック操作
		addTrack: (track: Track) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: [...song.tracks, track],
			}));
		},

		removeTrack: (trackId: string) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: song.tracks.filter((t) => t.id !== trackId),
			}));
		},

		updateTrack: (trackId: string, updates: Partial<Track>) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: song.tracks.map((t) =>
					t.id === trackId ? { ...t, ...updates } : t
				),
			}));
		},

		// ブロック操作
		addBlock: (trackId: string, block: DirectiveBlock) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: song.tracks.map((t) =>
					t.id === trackId ? { ...t, blocks: [...t.blocks, block] } : t
				),
			}));
		},

		removeBlock: (trackId: string, blockId: string) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: song.tracks.map((t) =>
					t.id === trackId
						? { ...t, blocks: t.blocks.filter((b) => b.id !== blockId) }
						: t
				),
			}));
		},

		updateBlock: (trackId: string, blockId: string, updates: Partial<DirectiveBlock>) => {
			updateCurrentSong((song) => ({
				...song,
				tracks: song.tracks.map((t) =>
					t.id === trackId
						? {
							...t,
							blocks: t.blocks.map((b) =>
								b.id === blockId ? { ...b, ...updates } : b
							),
						}
						: t
				),
			}));
		},

		// セクション操作
		addSection: (section: Section) => {
			updateCurrentSong((song) => ({
				...song,
				sections: [...song.sections, section],
			}));
		},

		removeSection: (sectionId: string) => {
			updateCurrentSong((song) => ({
				...song,
				sections: song.sections.filter((s) => s.id !== sectionId),
			}));
		},

		updateSection: (sectionId: string, updates: Partial<Section>) => {
			updateCurrentSong((song) => ({
				...song,
				sections: song.sections.map((s) =>
					s.id === sectionId ? { ...s, ...updates } : s
				),
			}));
		},

		clearError: () => {
			error = null;
		},
	};
};
