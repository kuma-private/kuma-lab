import * as api from '$lib/api';
import type { Thread, ThreadSummary, UserInfo } from '$lib/api';

export function createAppStore() {
	let user = $state<UserInfo | null>(null);
	let threads = $state<ThreadSummary[]>([]);
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

		async checkLogin() {
			try {
				user = await api.getMe();
			} catch {
				user = null;
			}
		},

		async loadThreads() {
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

		async loadThread(id: string) {
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

		async createThread(data: { title: string; key: string; timeSignature: string; bpm: number }) {
			loading = true;
			error = null;
			try {
				const result = await api.createThread(data);
				return result;
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to create thread';
				return null;
			} finally {
				loading = false;
			}
		},

		async addPost(threadId: string, chords: string, comment: string) {
			error = null;
			try {
				await api.addPost(threadId, { chords, comment });
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to add post';
			}
		},

		clearError() {
			error = null;
		}
	};
}
