export interface ChordEntry {
	start: number;
	end: number;
	chord: string;
	degree: string;
}

export interface AnalysisResult {
	key: { root: string; mode: string };
	chords: ChordEntry[];
}

export async function analyzeChords(
	url: string,
	startTime: number,
	endTime: number
): Promise<AnalysisResult> {
	const res = await fetch('/api/analyze', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, startTime, endTime })
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(err.error || 'Analysis failed');
	}
	return res.json();
}
