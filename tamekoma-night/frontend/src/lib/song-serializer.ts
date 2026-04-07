// song-serializer.ts — Song <-> text format serializer/deserializer

import type { Song, Section, Track, DirectiveBlock } from '$lib/types/song';

// ── Serialize ──────────────────────────────────────────

export function serializeSong(song: Song): string {
	const lines: string[] = [];

	// Metadata
	lines.push(`@title: ${song.title}`);
	lines.push(`@bpm: ${song.bpm}`);
	lines.push(`@key: ${song.key}`);
	lines.push(`@time: ${song.timeSignature}`);
	lines.push('');

	// Chords section
	lines.push('=== Chords ===');
	if (song.chordProgression.trim()) {
		const chordLines = song.chordProgression.trim().split('\n');

		// Insert section comments before relevant chord lines
		// We group chord lines by which section they fall into
		const sectionsSorted = [...song.sections].sort((a, b) => a.startBar - b.startBar);

		// Parse chord lines to understand bar positions
		let currentBar = 0;
		let sectionIndex = 0;

		for (const chordLine of chordLines) {
			const trimmed = chordLine.trim();
			if (!trimmed) {
				lines.push('');
				continue;
			}

			// Count bars in this line (number of | separators minus 1, or count chord groups)
			const barCount = countBarsInLine(trimmed);

			// Check if we should insert a section comment before this line
			while (sectionIndex < sectionsSorted.length) {
				const sec = sectionsSorted[sectionIndex];
				if (sec.startBar <= currentBar) {
					lines.push(`// ${sec.name} [bars ${sec.startBar + 1}-${sec.endBar}]`);
					sectionIndex++;
				} else {
					break;
				}
			}

			lines.push(trimmed);
			currentBar += barCount;
		}

		// Flush remaining sections that weren't placed
		while (sectionIndex < sectionsSorted.length) {
			const sec = sectionsSorted[sectionIndex];
			lines.push(`// ${sec.name} [bars ${sec.startBar + 1}-${sec.endBar}]`);
			sectionIndex++;
		}
	} else if (song.sections.length > 0) {
		// No chord text but sections exist — output section comments only
		const sectionsSorted = [...song.sections].sort((a, b) => a.startBar - b.startBar);
		for (const sec of sectionsSorted) {
			lines.push(`// ${sec.name} [bars ${sec.startBar + 1}-${sec.endBar}]`);
		}
	}

	// Tracks list
	if (song.tracks.length > 0) {
		lines.push('');
		lines.push('=== Tracks ===');
		for (const track of song.tracks) {
			lines.push(track.name);
		}
	}

	return lines.join('\n') + '\n';
}

function countBarsInLine(line: string): number {
	// Count bars: "| Am7 | Dm7 | G7 | C |" has 4 bars
	const pipes = line.split('|').filter((s) => s.trim() !== '');
	return Math.max(pipes.length, 1);
}

// ── Deserialize ────────────────────────────────────────

export interface DeserializeError {
	line: number;
	message: string;
}

export interface DeserializeResult {
	song: Partial<Song>;
	errors: DeserializeError[];
}

export function deserializeSong(text: string): DeserializeResult {
	const errors: DeserializeError[] = [];
	const lines = text.split('\n');

	let title = '';
	let bpm = 120;
	let key = 'C Major';
	let timeSignature = '4/4';

	const sections: Section[] = [];
	const trackMap = new Map<string, Track>();
	let chordLines: string[] = [];

	type ParseState = 'meta' | 'chords' | 'track-block' | 'tracks-list';

	let state: ParseState = 'meta';
	let currentTrackName = '';
	let currentBlockStart = 0;
	let currentBlockEnd = 0;
	let currentDirectiveLines: string[] = [];

	function flushTrackBlock() {
		if (state === 'track-block' && currentTrackName) {
			let track = trackMap.get(currentTrackName);
			if (!track) {
				track = {
					id: crypto.randomUUID(),
					name: currentTrackName,
					instrument: guessInstrument(currentTrackName),
					blocks: [],
					volume: 0,
					mute: false,
					solo: false
				};
				trackMap.set(currentTrackName, track);
			}
			track.blocks.push({
				id: crypto.randomUUID(),
				startBar: currentBlockStart,
				endBar: currentBlockEnd,
				directives: currentDirectiveLines.join('\n')
			});
			currentDirectiveLines = [];
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const trimmed = raw.trim();
		const lineNum = i + 1;

		// Blank line — skip but preserve chord blank lines
		if (trimmed === '') {
			if (state === 'chords') {
				chordLines.push('');
			}
			continue;
		}

		// Meta directives (@key: value) — only before first === section
		if (state === 'meta' && trimmed.startsWith('@')) {
			const metaMatch = trimmed.match(/^@(\w[\w-]*)\s*:\s*(.+)$/);
			if (metaMatch) {
				const [, mKey, mValue] = metaMatch;
				const val = mValue.trim();
				switch (mKey) {
					case 'title':
						title = val;
						break;
					case 'bpm': {
						const n = Number(val);
						if (Number.isFinite(n) && n > 0) bpm = n;
						else errors.push({ line: lineNum, message: `Invalid bpm: ${val}` });
						break;
					}
					case 'key':
						key = val;
						break;
					case 'time':
						timeSignature = val;
						break;
					default:
						errors.push({ line: lineNum, message: `Unknown meta key: @${mKey}` });
				}
				continue;
			}
		}

		// Section header: === ... ===
		const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===$/);
		if (sectionMatch) {
			flushTrackBlock();

			const headerContent = sectionMatch[1];

			// === Chords ===
			if (/^Chords$/i.test(headerContent.trim())) {
				state = 'chords';
				continue;
			}

			// === Tracks === (new simplified format)
			if (/^Tracks$/i.test(headerContent.trim())) {
				state = 'tracks-list';
				continue;
			}

			// === TrackName [bars X-Y] === (legacy format)
			const trackHeaderMatch = headerContent.match(/^(.+?)\s*\[bars\s+(\d+)\s*-\s*(\d+)\]$/);
			if (trackHeaderMatch) {
				state = 'track-block';
				currentTrackName = trackHeaderMatch[1].trim();
				currentBlockStart = parseInt(trackHeaderMatch[2]) - 1; // Convert 1-based to 0-based
				currentBlockEnd = parseInt(trackHeaderMatch[3]); // endBar is exclusive, text shows inclusive
				currentDirectiveLines = [];
				continue;
			}

			errors.push({ line: lineNum, message: `Unrecognized section header: ${trimmed}` });
			continue;
		}

		// Inside chords section
		if (state === 'chords') {
			// Section comment: // SectionName [bars X-Y]
			const commentMatch = trimmed.match(/^\/\/\s*(.+?)\s*\[bars\s+(\d+)\s*-\s*(\d+)\]$/);
			if (commentMatch) {
				sections.push({
					id: crypto.randomUUID(),
					name: commentMatch[1].trim(),
					startBar: parseInt(commentMatch[2]) - 1, // 0-based
					endBar: parseInt(commentMatch[3]) // exclusive
				});
				continue;
			}

			// Plain comment (no bars info)
			if (trimmed.startsWith('//')) {
				// Keep as chord line for round-trip fidelity
				chordLines.push(trimmed);
				continue;
			}

			// Chord line
			chordLines.push(trimmed);
			continue;
		}

		// Inside tracks list — each line is a track name
		if (state === 'tracks-list') {
			if (!trimmed.startsWith('//')) {
				const trackName = trimmed;
				if (!trackMap.has(trackName)) {
					trackMap.set(trackName, {
						id: crypto.randomUUID(),
						name: trackName,
						instrument: guessInstrument(trackName),
						blocks: [],
						volume: 0,
						mute: false,
						solo: false
					});
				}
			}
			continue;
		}

		// Inside track block — collect directive lines (legacy format)
		if (state === 'track-block') {
			currentDirectiveLines.push(trimmed);
			continue;
		}

		// Fallback: still in meta but got non-meta content — try treating as meta
		if (state === 'meta') {
			// Could be a stray line before first section
			errors.push({ line: lineNum, message: `Unexpected content before section: ${trimmed}` });
		}
	}

	// Flush last track block
	flushTrackBlock();

	// Clean up chord lines (trim trailing blanks)
	while (chordLines.length > 0 && chordLines[chordLines.length - 1].trim() === '') {
		chordLines.pop();
	}

	const song: Partial<Song> = {
		title,
		bpm,
		key,
		timeSignature,
		chordProgression: chordLines.join('\n'),
		sections,
		tracks: Array.from(trackMap.values())
	};

	return { song, errors };
}

function guessInstrument(name: string): string {
	const lower = name.toLowerCase();
	if (lower.includes('drum')) return 'drums';
	if (lower.includes('bass')) return 'bass';
	if (lower.includes('string')) return 'strings';
	if (lower.includes('guitar')) return 'guitar';
	if (lower.includes('organ')) return 'organ';
	if (lower.includes('piano') || lower.includes('grand') || lower.includes('rhodes') || lower.includes('clav')) return 'piano';
	return 'piano';
}

// ── Merge helper ───────────────────────────────────────
// Merges deserialized partial song into an existing Song, preserving IDs

export function mergeParsedSong(original: Song, parsed: Partial<Song>): Song {
	return {
		...original,
		title: parsed.title ?? original.title,
		bpm: parsed.bpm ?? original.bpm,
		key: parsed.key ?? original.key,
		timeSignature: parsed.timeSignature ?? original.timeSignature,
		chordProgression: parsed.chordProgression ?? original.chordProgression,
		sections: parsed.sections && parsed.sections.length > 0 ? parsed.sections : original.sections,
		// NOTE: tracks are intentionally NOT merged from parsed data.
		// The text format doesn't include block/MIDI data, so merging
		// parsed.tracks would destroy existing track blocks. Tracks are
		// managed exclusively through the Flow tab.
		lastEditedAt: new Date().toISOString()
	};
}
