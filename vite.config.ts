import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  base: './',
  publicDir: '.build-public',
  plugins: [svelte(), {
    name: 'build-marker',
    transformIndexHtml: html => html.replaceAll('%JUMPIT_BUILD%', process.env.JUMPIT_BUILD || 'development'),
  }],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.JUMPIT_VERSION || '2.1.0-dev'),
    __BUILD_ID__: JSON.stringify(process.env.JUMPIT_BUILD || 'development'),
    __SOURCE_SHA__: JSON.stringify(process.env.JUMPIT_SOURCE || 'development'),
    __PRECACHE_ASSETS__: JSON.stringify('__PRECACHE_ASSETS__'),
  },
  server: { host: '127.0.0.1', port: 4392, strictPort: true },
  build: {
    outDir: 'build',
    target: 'es2022',
    license: { fileName: 'licenses.md' },
    rolldownOptions: {
      input: { app: 'index.html', sw: 'src/service-worker.ts' },
      output: {
        entryFileNames: chunk => chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
        postBanner: '/* Bundled dependency licenses: ./licenses.md */',
      },
    },
  },
})
