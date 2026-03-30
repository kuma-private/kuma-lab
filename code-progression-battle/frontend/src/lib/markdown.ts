// markdown.ts
// Markdown export/import for chord progression threads

import type { Thread } from './api';

/**
 * Export a thread to Markdown format.
 */
export function threadToMarkdown(thread: Thread): string {
	const lines: string[] = [];

	lines.push(`# ${thread.title}`);
	lines.push('');
	lines.push(`- Key: ${thread.key}`);
	lines.push(`- Time Signature: ${thread.timeSignature}`);
	lines.push(`- BPM: ${thread.bpm}`);
	lines.push(`- Created by: ${thread.createdByName}`);
	lines.push('');
	lines.push('## Chord Progressions');
	lines.push('');

	thread.posts.forEach((post, i) => {
		lines.push(`### #${i + 1} by ${post.userName}`);
		lines.push('');
		lines.push('```');
		lines.push(post.chords);
		lines.push('```');

		if (post.comment.trim()) {
			lines.push('');
			lines.push(post.comment);
		}

		lines.push('');
	});

	return lines.join('\n');
}

export interface ImportedThread {
	title: string;
	key: string;
	timeSignature: string;
	bpm: number;
	posts: { chords: string; comment: string }[];
}

/**
 * Import a thread from Markdown format.
 */
export function markdownToThread(md: string): ImportedThread {
	const lines = md.split('\n');

	let title = '';
	let key = '';
	let timeSignature = '4/4';
	let bpm = 120;
	const posts: { chords: string; comment: string }[] = [];

	let inCodeBlock = false;
	let currentChords = '';
	let currentComment = '';
	let hasPost = false;

	for (const line of lines) {
		if (line.startsWith('# ') && !line.startsWith('## ') && !line.startsWith('### ')) {
			title = line.slice(2).trim();
			continue;
		}

		const keyMatch = line.match(/^- Key:\s*(.+)/);
		if (keyMatch) { key = keyMatch[1].trim(); continue; }

		const tsMatch = line.match(/^- Time Signature:\s*(.+)/);
		if (tsMatch) { timeSignature = tsMatch[1].trim(); continue; }

		const bpmMatch = line.match(/^- BPM:\s*(\d+)/);
		if (bpmMatch) { bpm = parseInt(bpmMatch[1], 10); continue; }

		if (line.startsWith('### ')) {
			if (hasPost) {
				posts.push({ chords: currentChords.trim(), comment: currentComment.trim() });
			}
			currentChords = '';
			currentComment = '';
			hasPost = true;
			continue;
		}

		if (line.trim() === '```') {
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (hasPost) {
			if (inCodeBlock) {
				currentChords += (currentChords ? '\n' : '') + line;
			} else {
				if (line.trim()) {
					currentComment += (currentComment ? '\n' : '') + line;
				}
			}
		}
	}

	if (hasPost) {
		posts.push({ chords: currentChords.trim(), comment: currentComment.trim() });
	}

	return { title, key, timeSignature, bpm, posts };
}
