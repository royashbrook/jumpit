import { build, loadConfigFromFile } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const identity = JSON.parse(await readFile('build/version.json', 'utf8'))
process.env.JUMPIT_BUILD = identity.build
process.env.JUMPIT_VERSION = identity.version
process.env.JUMPIT_SOURCE = identity.source
const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' })
if (!loaded) throw new Error('Missing Vite config')
await build({
  ...loaded.config,
  configFile: false,
  root: resolve('tests/harness'),
  publicDir: resolve('.build-public'),
  build: {
    ...loaded.config.build,
    outDir: resolve('build-harness'),
    emptyOutDir: true,
    rolldownOptions: { input: resolve('tests/harness/index.html') },
  },
})
