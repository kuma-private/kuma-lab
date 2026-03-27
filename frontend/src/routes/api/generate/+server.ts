import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const backendUrl = env.BACKEND_URL;
	if (!backendUrl) {
		throw error(500, 'BACKEND_URL is not configured');
	}

	const sessionCookie = cookies.get('session');

	const res = await fetch(`${backendUrl}/api/generate`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(sessionCookie ? { Cookie: `session=${sessionCookie}` } : {})
		}
	});

	if (!res.ok) {
		throw error(res.status, await res.text());
	}

	const data = await res.json();
	return json(data);
};
