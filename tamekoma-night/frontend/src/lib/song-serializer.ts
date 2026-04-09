// song-serializer.ts — Song <-> text format serializer/deserializer

import type { Song, Section, Track, DirectiveBlock } from '$lib/types/song';

// ── Serialize ──────────────────────────────────────────

export function serializeSong(song: Song): string {
	const lines: string[] = [];

	// Chords section
	lines.push('## Chords');
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
					lines.push(`### ${sec.name}`);
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
			lines.push(`// ${sec.name}`);
			sectionIndex++;
		}
	} else if (song.sections.length > 0) {
		// No chord text but sections exist — output section comments only
		const sectionsSorted = [...song.sections].sort((a, b) => a.startBar - b.startBar);
		for (const sec of sectionsSorted) {
			lines.push(`// ${sec.name}`);
		}
	}

	// Tracks list (always output section header so it stays visible in Text tab)
	// Compute total bars for default activeEnd display
	let totalBars = 0;
	if (song.chordProgression.trim()) {
		for (const cl of song.chordProgression.trim().split('\n')) {
			const t = cl.trim();
			if (t) totalBars += countBarsInLine(t);
		}
	}

	lines.push('');
	lines.push('## Tracks');
	for (const track of song.tracks) {
		const start = (track.activeStart ?? 0) + 1;
		const end = track.activeEnd ?? totalBars;
		lines.push(`- ${track.name} [${start}-${end}]`);
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

		// Section header: === ... === or ## ...
		const sectionMatch = trimmed.match(/^===\s*(.+?)\s*===$/);
		const markdownHeaderMatch = !sectionMatch ? trimmed.match(/^##\s+(.+)$/) : null;
		const headerContent = sectionMatch?.[1] ?? markdownHeaderMatch?.[1];
		if (headerContent) {
			flushTrackBlock();

			// Chords
			if (/^Chords$/i.test(headerContent.trim())) {
				state = 'chords';
				continue;
			}

			// Tracks
			if (/^Tracks$/i.test(headerContent.trim())) {
				state = 'tracks-list';
				continue;
			}

			// === TrackName [bars X-Y] === (legacy format)
			if (sectionMatch) {
				const trackHeaderMatch = headerContent.match(/^(.+?)\s*\[bars\s+(\d+)\s*-\s*(\d+)\]$/);
				if (trackHeaderMatch) {
					state = 'track-block';
					currentTrackName = trackHeaderMatch[1].trim();
					currentBlockStart = parseInt(trackHeaderMatch[2]) - 1; // Convert 1-based to 0-based
					currentBlockEnd = parseInt(trackHeaderMatch[3]); // endBar is exclusive, text shows inclusive
					currentDirectiveLines = [];
					continue;
				}
			}

			errors.push({ line: lineNum, message: `Unrecognized section header: ${trimmed}` });
			continue;
		}

		// Inside chords section
		if (state === 'chords') {
			// Section comment: // SectionName [bars X-Y] (legacy format with bar range)
			const commentMatchBars = trimmed.match(/^\/\/\s*(.+?)\s*\[bars\s+(\d+)\s*-\s*(\d+)\]$/);
			if (commentMatchBars) {
				sections.push({
					id: crypto.randomUUID(),
					name: commentMatchBars[1].trim(),
					startBar: parseInt(commentMatchBars[2]) - 1, // 0-based
					endBar: parseInt(commentMatchBars[3]) // exclusive
				});
				continue;
			}

			// Section comment: ### SectionName, # SectionName (legacy), or // SectionName (without bar range)
			const commentMatchName = trimmed.match(/^###\s+(.+)$/) ?? trimmed.match(/^\/\/\s*(.+)$/) ?? trimmed.match(/^#\s+(.+)$/);
			if (commentMatchName) {
				// Count bars accumulated so far to determine startBar
				let barsAccum = 0;
				for (const cl of chordLines) {
					const t = cl.trim();
					if (t && !t.startsWith('//')) {
						barsAccum += countBarsInLine(t);
					}
				}
				sections.push({
					id: crypto.randomUUID(),
					name: commentMatchName[1].trim(),
					startBar: barsAccum,
					endBar: -1 // sentinel: resolved after parsing
				});
				continue;
			}

			// Chord line
			chordLines.push(trimmed);
			continue;
		}

		// Inside tracks list — each line is a track name (with optional leading "- ") and optional [start-end]
		if (state === 'tracks-list') {
			if (!trimmed.startsWith('//')) {
				const raw = trimmed.startsWith('- ') ? trimmed.slice(2) : trimmed;
				const trackMatch = raw.match(/^(.+?)(?:\s+\[(\d+)-(\d+)\])?\s*$/);
				if (trackMatch) {
					const name = trackMatch[1].trim();
					const activeStart = trackMatch[2] ? parseInt(trackMatch[2]) - 1 : undefined;
					const activeEnd = trackMatch[3] ? parseInt(trackMatch[3]) : undefined;
					if (!trackMap.has(name)) {
						trackMap.set(name, {
							id: crypto.randomUUID(),
							name,
							instrument: guessInstrument(name),
							blocks: [],
							volume: 0,
							mute: false,
							solo: false,
							activeStart,
							activeEnd
						});
					}
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

	// Resolve sections with endBar === -1 (new format without bar range)
	// endBar = next section's startBar, or total bar count for the last section
	if (sections.some((s) => s.endBar === -1)) {
		let totalBars = 0;
		for (const cl of chordLines) {
			const t = cl.trim();
			if (t && !t.startsWith('//')) {
				totalBars += countBarsInLine(t);
			}
		}
		const sorted = sections.slice().sort((a, b) => a.startBar - b.startBar);
		for (let si = 0; si < sorted.length; si++) {
			if (sorted[si].endBar === -1) {
				const nextStart = si + 1 < sorted.length ? sorted[si + 1].startBar : totalBars;
				sorted[si].endBar = nextStart;
			}
		}
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
	// Update active ranges on existing tracks from parsed text data.
	// We don't replace tracks wholesale (that would destroy blocks/MIDI),
	// but active range edits in the Text tab should propagate.
	const mergedTracks = original.tracks.map((t) => {
		if (parsed.tracks && parsed.tracks.length > 0) {
			const pt = parsed.tracks.find((p) => p.name === t.name);
			if (pt) {
				return {
					...t,
					activeStart: pt.activeStart !== undefined ? pt.activeStart : t.activeStart,
					activeEnd: pt.activeEnd !== undefined ? pt.activeEnd : t.activeEnd
				};
			}
		}
		return t;
	});

	return {
		...original,
		title: parsed.title || original.title,
		bpm: parsed.bpm ?? original.bpm,
		key: parsed.key ?? original.key,
		timeSignature: parsed.timeSignature ?? original.timeSignature,
		chordProgression: parsed.chordProgression ?? original.chordProgression,
		sections: parsed.sections && parsed.sections.length > 0 ? parsed.sections : original.sections,
		tracks: mergedTracks,
		lastEditedAt: new Date().toISOString()
	};
}
