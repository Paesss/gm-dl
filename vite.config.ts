import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    
    monkey({


      entry: 'src/index.userscript.ts',
      userscript: {
        grant: ['GM_download', 'GM_xmlhttpRequest', 'GM_info'],
        icon: 'https://vitejs.dev/logo.svg',
        namespace: 'npm/vite-plugin-monkey',
        match: ['*://*/*'],
      },
    }),
  ],
});
