export type CeremonyPhase = 'IDLE' | 'SUMMONING' | 'SHOWING' | 'PURIFYING' | 'DONE';

export interface CodeLine {
	c: string;
	s: string | null;
}

export interface GenerateResponse {
	theme: string;
	lang: string;
	lines: CodeLine[];
	fs: string;
	why: string;
}

export interface CeremonyState {
	phase: CeremonyPhase;
	response: GenerateResponse | null;
	error: string | null;
	isLoading: boolean;
}
