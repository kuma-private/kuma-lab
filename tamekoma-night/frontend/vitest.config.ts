import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.ts'],
		exclude: ['e2e/**', 'node_modules/**']
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, './src/lib')
		}
	}
});
