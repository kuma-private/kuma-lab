import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const backendUrl = env.BACKEND_URL;
	if (!backendUrl) {
		throw redirect(302, '/?error=config');
	}

	throw redirect(302, `${backendUrl}/auth/google`);
};
