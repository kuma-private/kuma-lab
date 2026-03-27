import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const backendUrl = env.BACKEND_URL;

	if (backendUrl) {
		const sessionCookie = cookies.get('session');
		try {
			await fetch(`${backendUrl}/auth/logout`, {
				method: 'POST',
				headers: sessionCookie ? { Cookie: `session=${sessionCookie}` } : {}
			});
		} catch {
			// Backend logout failure is non-critical
		}
	}

	cookies.delete('session', { path: '/' });
	throw redirect(302, '/');
};
