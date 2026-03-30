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

		get isMyTurn() {
			if (!user || !currentThread) return false;
			return currentThread.currentTurn === user.sub;
		},

		get isPlayer() {
			if (!user || !currentThread) return false;
			return currentThread.createdBy === user.sub || currentThread.opponentId === user.sub;
		},

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

		async createThread(data: { title: string; key: string; timeSignature: string; bpm: number; opponentEmail: string }) {
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

		async joinThread(threadId: string) {
			error = null;
			try {
				await api.joinThread(threadId);
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to join';
			}
		},

		async submitTurn(threadId: string, action: string, lineNumber: number, chords: string, comment: string) {
			error = null;
			try {
				await api.submitTurn(threadId, { action, lineNumber, chords, comment });
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to submit turn';
			}
		},

		async proposeFinish(threadId: string) {
			error = null;
			try {
				await api.proposeFinish(threadId);
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to propose finish';
			}
		},

		async acceptFinish(threadId: string) {
			error = null;
			try {
				await api.acceptFinish(threadId);
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to accept';
			}
		},

		async rejectFinish(threadId: string) {
			error = null;
			try {
				await api.rejectFinish(threadId);
				await this.loadThread(threadId);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to reject';
			}
		},

		clearError() {
			error = null;
		}
	};
}
