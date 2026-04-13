import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 51873,
		strictPort: true,
		proxy: {
			'/api': 'http://localhost:51874',
			'/auth': 'http://localhost:51874',
			'/health': 'http://localhost:51874'
		}
	}
});
