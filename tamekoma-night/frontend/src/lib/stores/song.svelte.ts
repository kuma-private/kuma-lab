import type { Song, Track, DirectiveBlock, Section } from '$lib/types/song';
import { createDefaultSong } from '$lib/types/song';

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

		// Song CRUD — API連携は後のIssueで実装。今はローカル操作のみ
		createSong: (title: string) => {
			const song = createDefaultSong(title);
			songs = [...songs, song];
			currentSong = song;
			return song;
		},

		updateSong: (song: Song) => {
			song.lastEditedAt = new Date().toISOString();
			songs = songs.map((s) => (s.id === song.id ? song : s));
			if (currentSong?.id === song.id) {
				currentSong = song;
			}
		},

		deleteSong: (id: string) => {
			songs = songs.filter((s) => s.id !== id);
			if (currentSong?.id === id) {
				currentSong = null;
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
