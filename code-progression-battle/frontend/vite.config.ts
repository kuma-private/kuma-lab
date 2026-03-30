import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 52730,
		strictPort: true,
		proxy: {
			'/api': 'http://localhost:52731',
			'/auth': 'http://localhost:52731',
			'/health': 'http://localhost:52731'
		}
	}
});
