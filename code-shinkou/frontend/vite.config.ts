import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 52718,
		strictPort: true,
		proxy: {
			'/api': 'http://localhost:52719',
			'/health': 'http://localhost:52719'
		}
	}
});
