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
			formats: ['umd', 'es', 'cjs'],
			name: 'GM_dl',
			fileName: (format, entryName) => {
				if(format === 'es') {
					return `${entryName}.js`
				} else if(format === 'cjs') {
					return `${entryName}.cjs`
				} else {
					return `${entryName}.${format}.js`
				}
			},
		},

	},

});
