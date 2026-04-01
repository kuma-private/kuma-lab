import * as api from '$lib/api';
import type { Thread, SaveHistory, UserInfo } from '$lib/api';

export const createAppStore = () => {
	let user = $state<UserInfo | null>(null);
	let threads = $state<Thread[]>([]);
	let currentThread = $state<Thread | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	return {
		get user() { return user; },
		get threads() { return threads; },
		get currentThread() { return currentThread; },
		get loading() { return loading; },
		get error() { return error; },
		get loggedIn() { return user !== null; },

		checkLogin: async () => {
			try {
				user = await api.getMe();
			} catch {
				user = null;
			}
		},

		loadThreads: async () => {
			loading = true;
			error = null;
			try {
				threads = await api.getThreads();
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load threads';
			} finally {
				loading = false;
			}
		},

		loadThread: async (id: string) => {
			loading = true;
			error = null;
			try {
				currentThread = await api.getThread(id);
			} catch (e) {
				if (e instanceof Error && e.message === 'LOGIN_REQUIRED') {
					window.location.href = '/auth/google';
					return;
				}
				error = e instanceof Error ? e.message : 'Failed to load thread';
			} finally {
				loading = false;
			}
		},

		createThread: async (data: { title: string }) => {
			loading = true;
			error = null;
			try {
				return await api.createThread(data);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to create thread';
				return null;
			} finally {
				loading = false;
			}
		},

		saveScore: async (threadId: string, data: { score: string; comment: string }) => {
			error = null;
			try {
				await api.saveScore(threadId, data);
				currentThread = await api.getThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to save score';
			}
		},

		updateSettings: async (threadId: string, data: { key?: string; timeSignature?: string; bpm?: number }) => {
			error = null;
			try {
				await api.updateSettings(threadId, data);
				currentThread = await api.getThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to update settings';
			}
		},

		requestReview: async (threadId: string): Promise<{ comment: string; scores: string }> => {
			error = null;
			try {
				const result = await api.requestReview(threadId);
				currentThread = await api.getThread(threadId);
				return result;
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to request review';
				return { comment: '', scores: '' };
			}
		},

		loadHistory: async (threadId: string): Promise<SaveHistory[]> => {
			error = null;
			try {
				return await api.getHistory(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load history';
				return [];
			}
		},

		clearError: () => {
			error = null;
		}
	};
};
