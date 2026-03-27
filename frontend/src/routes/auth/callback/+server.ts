import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const backendUrl = env.BACKEND_URL;
	if (!backendUrl) {
		throw error(500, 'BACKEND_URL is not configured');
	}

	const queryString = url.searchParams.toString();
	const res = await fetch(`${backendUrl}/auth/callback?${queryString}`);

	if (!res.ok) {
		throw error(res.status, 'Authentication failed');
	}

	const setCookie = res.headers.get('set-cookie');
	if (setCookie) {
		const match = setCookie.match(/session=([^;]+)/);
		if (match) {
			cookies.set('session', match[1], {
				path: '/',
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 7 // 7 days
			});
		}
	}

	throw redirect(302, '/');
};
