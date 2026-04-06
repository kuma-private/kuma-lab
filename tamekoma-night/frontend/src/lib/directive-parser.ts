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
	comment: { key: 'comment', validate: commentValidator() }
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
	}

	return { directives, errors };
}
