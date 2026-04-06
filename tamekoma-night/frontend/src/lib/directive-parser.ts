// directive-parser.ts — @key: value ディレクティブのパーサー

// ── Types ──────────────────────────────────────────────

export interface NoteRange {
	low: string;
	high: string;
}

export interface VelocityGradient {
	from: VelocityLevel;
	to: VelocityLevel;
}

export type VelocityLevel = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

export type VelocityValue = VelocityLevel | VelocityGradient;

export interface MelodyNote {
	midi: number;
	durationTicks: number;
	isRest: boolean;
}

export interface ParsedMelody {
	notes: MelodyNote[];
	errors: string[];
}

export interface ParsedDirectives {
	mode?: string;
	swing?: number;
	strum?: number;
	humanize?: number;
	voicing?: string;
	range?: NoteRange;
	octave?: number;
	lead?: string;
	bass?: string;
	velocity?: VelocityValue;
	instrument?: string;
	comment?: string;
	melody?: ParsedMelody;
}

export interface ParseError {
	line: number;
	message: string;
	raw: string;
}

export interface ParseResult {
	directives: ParsedDirectives;
	errors: ParseError[];
}

// ── Constants ──────────────────────────────────────────

const VALID_MODES = [
	'block',
	'arpUp',
	'arpDown',
	'fingerpick',
	'bossa-nova',
	'comp-jazz',
	'8beat',
	'walking',
	'root',
	'root-fifth',
	'sustain',
	'free'
] as const;

const VALID_VOICINGS = ['close', 'open', 'drop2', 'spread', 'shell'] as const;

const VALID_LEADS = ['smooth'] as const;

const VALID_INSTRUMENTS = ['piano', 'organ', 'strings', 'bass', 'guitar', 'drums'] as const;

const VELOCITY_LEVELS: readonly VelocityLevel[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'] as const;

// Note name pattern: C, C#, Db, etc. followed by octave number
const NOTE_PATTERN = /^[A-Ga-g][#b]?\d+$/;

// ── Validators ─────────────────────────────────────────

type Validator = (value: string) => { ok: true; parsed: unknown } | { ok: false; msg: string };

function enumValidator(name: string, allowed: readonly string[]): Validator {
	return (value: string) => {
		if ((allowed as readonly string[]).includes(value)) {
			return { ok: true, parsed: value };
		}
		return { ok: false, msg: `@${name}: "${value}" は無効。有効値: ${allowed.join(', ')}` };
	};
}

function rangeNumberValidator(
	name: string,
	min: number,
	max: number,
	stripSuffix?: string
): Validator {
	return (value: string) => {
		let cleaned = value.trim();
		if (stripSuffix) {
			cleaned = cleaned.replace(new RegExp(`${stripSuffix}$`, 'i'), '').trim();
		}
		const num = Number(cleaned);
		if (!Number.isFinite(num) || num < min || num > max) {
			return { ok: false, msg: `@${name}: "${value}" は無効。${min}〜${max}の数値を指定` };
		}
		return { ok: true, parsed: num };
	};
}

function numberValidator(name: string, stripSuffix?: string): Validator {
	return (value: string) => {
		let cleaned = value.trim();
		if (stripSuffix) {
			cleaned = cleaned.replace(new RegExp(`${stripSuffix}$`, 'i'), '').trim();
		}
		const num = Number(cleaned);
		if (!Number.isFinite(num)) {
			return { ok: false, msg: `@${name}: "${value}" は有効な数値ではない` };
		}
		return { ok: true, parsed: num };
	};
}

function positiveIntValidator(name: string): Validator {
	return (value: string) => {
		const num = Number(value.trim());
		if (!Number.isInteger(num) || num <= 0) {
			return { ok: false, msg: `@${name}: "${value}" は無効。正の整数を指定` };
		}
		return { ok: true, parsed: num };
	};
}

function noteRangeValidator(): Validator {
	return (value: string) => {
		const parts = value.split('-');
		if (parts.length !== 2) {
			return { ok: false, msg: `@range: "${value}" は無効。"C3-B4" のように指定` };
		}
		const [low, high] = parts.map((s) => s.trim());
		if (!NOTE_PATTERN.test(low) || !NOTE_PATTERN.test(high)) {
			return { ok: false, msg: `@range: "${value}" は無効なノート名を含む` };
		}
		return { ok: true, parsed: { low, high } as NoteRange };
	};
}

function velocityValidator(): Validator {
	return (value: string) => {
		const trimmed = value.trim();

		// Check gradient: → or ->
		const arrowMatch = trimmed.match(/^(\w+)\s*(?:→|->)\s*(\w+)$/);
		if (arrowMatch) {
			const from = arrowMatch[1] as VelocityLevel;
			const to = arrowMatch[2] as VelocityLevel;
			if (!VELOCITY_LEVELS.includes(from) || !VELOCITY_LEVELS.includes(to)) {
				return {
					ok: false,
					msg: `@velocity: "${value}" のグラデーションに無効なレベルが含まれる。有効値: ${VELOCITY_LEVELS.join(', ')}`
				};
			}
			return { ok: true, parsed: { from, to } as VelocityGradient };
		}

		// Single level
		if (VELOCITY_LEVELS.includes(trimmed as VelocityLevel)) {
			return { ok: true, parsed: trimmed as VelocityLevel };
		}

		return {
			ok: false,
			msg: `@velocity: "${value}" は無効。有効値: ${VELOCITY_LEVELS.join(', ')} またはグラデーション (例: mp→f)`
		};
	};
}

function bassValidator(): Validator {
	return (value: string) => {
		const trimmed = value.trim();
		const simpleValues = ['root', 'root-fifth', 'walking'];
		if (simpleValues.includes(trimmed)) {
			return { ok: true, parsed: trimmed };
		}
		// pedal=X where X is a note name
		const pedalMatch = trimmed.match(/^pedal=([A-Ga-g][#b]?\d*)$/);
		if (pedalMatch) {
			return { ok: true, parsed: trimmed };
		}
		return {
			ok: false,
			msg: `@bass: "${value}" は無効。有効値: root, root-fifth, walking, pedal=<ノート名>`
		};
	};
}

function commentValidator(): Validator {
	return (value: string) => {
		return { ok: true, parsed: value };
	};
}

// ── Melody parser ─────────────────────────────────────

const TICKS_PER_QUARTER = 480;

const BASE_NOTE_MAP: Record<string, number> = {
	c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11
};

const DURATION_TICKS: Record<number, number> = {
	1: TICKS_PER_QUARTER * 4,
	2: TICKS_PER_QUARTER * 2,
	4: TICKS_PER_QUARTER,
	8: TICKS_PER_QUARTER / 2,
	16: TICKS_PER_QUARTER / 4
};

// Token pattern:
//   rest:    r followed by optional duration and dot
//   note:    note-name, optional accidental, optional octave marks, optional duration, optional dot
const MELODY_TOKEN = /^(r|[a-g])([#b]?)([',]*)(1|2|4|8|16)?(\.)?$/;

export function parseMelody(melodyText: string): ParsedMelody {
	const notes: MelodyNote[] = [];
	const errors: string[] = [];

	// Strip bar lines and split into tokens
	const tokens = melodyText
		.replace(/\|/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 0);

	for (const token of tokens) {
		const m = token.match(MELODY_TOKEN);
		if (!m) {
			errors.push(`不正なトークン: "${token}"`);
			continue;
		}

		const [, noteName, accidental, octaveMarks, durationStr, dot] = m;
		const isRest = noteName === 'r';

		// Duration
		const durationNum = durationStr ? Number(durationStr) : 4;
		let durationTicks = DURATION_TICKS[durationNum];
		if (durationTicks === undefined) {
			errors.push(`不正な音長: "${token}"`);
			continue;
		}
		if (dot) {
			durationTicks = Math.round(durationTicks * 1.5);
		}

		if (isRest) {
			// Rest should not have accidental or octave marks
			if (accidental || octaveMarks) {
				errors.push(`不正なトークン: "${token}"`);
				continue;
			}
			notes.push({ midi: 0, durationTicks, isRest: true });
			continue;
		}

		// Compute MIDI number
		const baseSemitone = BASE_NOTE_MAP[noteName];
		let semitoneOffset = 0;
		if (accidental === '#') semitoneOffset = 1;
		else if (accidental === 'b') semitoneOffset = -1;

		// Base octave: undecorated = octave 3 (C3 = MIDI 48)
		let octave = 3;
		for (const ch of octaveMarks) {
			if (ch === "'") octave++;
			else if (ch === ',') octave--;
		}

		const midi = (octave + 1) * 12 + baseSemitone + semitoneOffset;
		if (midi < 0 || midi > 127) {
			errors.push(`MIDIレンジ外: "${token}" (MIDI ${midi})`);
			continue;
		}

		notes.push({ midi, durationTicks, isRest: false });
	}

	return { notes, errors };
}

function melodyValidator(): Validator {
	return (value: string) => {
		const result = parseMelody(value);
		// Always accept — errors are reported inside ParsedMelody
		return { ok: true, parsed: result };
	};
}

// ── Directive registry ─────────────────────────────────

interface DirectiveDef {
	key: keyof ParsedDirectives;
	validate: Validator;
}

const DIRECTIVE_MAP: Record<string, DirectiveDef> = {
	mode: { key: 'mode', validate: enumValidator('mode', VALID_MODES) },
	swing: { key: 'swing', validate: rangeNumberValidator('swing', 0, 70, '%') },
	strum: { key: 'strum', validate: numberValidator('strum', 'ms') },
	humanize: { key: 'humanize', validate: rangeNumberValidator('humanize', 0, 30, '%') },
	voicing: { key: 'voicing', validate: enumValidator('voicing', VALID_VOICINGS) },
	range: { key: 'range', validate: noteRangeValidator() },
	octave: { key: 'octave', validate: positiveIntValidator('octave') },
	lead: { key: 'lead', validate: enumValidator('lead', VALID_LEADS) },
	bass: { key: 'bass', validate: bassValidator() },
	velocity: { key: 'velocity', validate: velocityValidator() },
	instrument: { key: 'instrument', validate: enumValidator('instrument', VALID_INSTRUMENTS) },
	comment: { key: 'comment', validate: commentValidator() },
	melody: { key: 'melody', validate: melodyValidator() }
};

// ── Parser ─────────────────────────────────────────────

const DIRECTIVE_LINE = /^@(\w[\w-]*)\s*:\s*(.+)$/;

export function parseDirectives(text: string): ParseResult {
	const directives: ParsedDirectives = {};
	const errors: ParseError[] = [];

	const lines = text.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const trimmed = raw.trim();
		const lineNum = i + 1;

		// Skip blank lines
		if (trimmed === '') continue;

		// Must match @key: value
		const match = trimmed.match(DIRECTIVE_LINE);
		if (!match) {
			errors.push({ line: lineNum, message: `不正な形式: "@key: value" の形式で記述してください`, raw });
			continue;
		}

		const [, key, rawValue] = match;
		const value = rawValue.trim();

		// Unknown key
		const def = DIRECTIVE_MAP[key];
		if (!def) {
			errors.push({ line: lineNum, message: `未知のディレクティブ: @${key}`, raw });
			continue;
		}

		// Validate value
		const result = def.validate(value);
		if (!result.ok) {
			errors.push({ line: lineNum, message: result.msg, raw });
			continue;
		}

		// Assign (later occurrence overwrites)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(directives as any)[def.key] = result.parsed;

		// Propagate melody parse errors to top-level errors
		if (key === 'melody') {
			const melody = result.parsed as ParsedMelody;
			for (const melodyErr of melody.errors) {
				errors.push({ line: lineNum, message: `@melody: ${melodyErr}`, raw });
			}
		}
	}

	return { directives, errors };
}
