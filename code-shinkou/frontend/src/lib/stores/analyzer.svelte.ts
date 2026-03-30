import { analyzeChords, type AnalysisResult } from '$lib/api';

function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
		/^([a-zA-Z0-9_-]{11})$/
	];
	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) return match[1];
	}
	return null;
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, '0')}`;
}

export function createAnalyzerStore() {
	let url = $state('');
	let videoId = $state<string | null>(null);
	let startTime = $state<number | null>(null);
	let endTime = $state<number | null>(null);
	let result = $state<AnalysisResult | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	return {
		get url() { return url; },
		set url(v: string) {
			url = v;
			videoId = extractVideoId(v);
			result = null;
			error = null;
		},
		get videoId() { return videoId; },
		get startTime() { return startTime; },
		get endTime() { return endTime; },
		get startTimeFormatted() { return startTime !== null ? formatTime(startTime) : '--:--'; },
		get endTimeFormatted() { return endTime !== null ? formatTime(endTime) : '--:--'; },
		get result() { return result; },
		get loading() { return loading; },
		get error() { return error; },
		get canAnalyze() {
			return videoId !== null && startTime !== null && endTime !== null && endTime > startTime && !loading;
		},

		setStartTime(t: number) {
			startTime = t;
			result = null;
			error = null;
		},

		setEndTime(t: number) {
			endTime = t;
			result = null;
			error = null;
		},

		async analyze() {
			if (!videoId || startTime === null || endTime === null) return;

			loading = true;
			error = null;
			result = null;

			try {
				result = await analyzeChords(url, startTime, endTime);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Unknown error';
			} finally {
				loading = false;
			}
		}
	};
}
