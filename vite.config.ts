import { defineConfig } from 'vite';



// https://vitejs.dev/config/
export default defineConfig({

	build: {
    target: 'es2020',
    minify: false,
		emptyOutDir: false,
		lib: {
			entry: {
				index: './src/index.ts',
			},
			formats: ['iife', 'es', 'umd'],
			name: 'GM_dl',
			fileName: (format, entryName) => `${entryName}.${format}.js`,
		},

	},

});
