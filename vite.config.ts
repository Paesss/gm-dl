import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    
    monkey({
      server: {
        mountGmApi: true,
      },
      entry: 'src/index.ts',
      userscript: {
        grant: ['GM_download', 'GM_xmlhttpRequest', 'GM.xmlHttpRequest'],
        icon: 'https://vitejs.dev/logo.svg',
        namespace: 'npm/vite-plugin-monkey',
        match: ['*://*/*'],
      },
    }),
  ],
});
