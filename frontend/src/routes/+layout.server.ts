import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const sessionCookie = cookies.get('session');
	return {
		user: sessionCookie ? { authenticated: true } : null
	};
};
