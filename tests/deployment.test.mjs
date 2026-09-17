import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('both deployment paths rebuild and check the current clean milestone release before publishing', async () => {
  for (const name of ['cloudflare', 'pages']) {
    const workflow = await readFile(`.github/workflows/${name}.yml`, 'utf8')
    assert.match(workflow, /workflow_run:[\s\S]*workflows: \[functional\]/)
    assert.match(workflow, /conclusion == 'success'/)
    assert.match(workflow, /head_repository\.full_name == github\.repository/)
    assert.match(workflow, /cancel-in-progress: false/)
    assert.match(workflow, /ref: main\s+fetch-depth: 0/)
    assert.match(workflow, /RELEASE_BUILD: '1'/)
    assert.match(workflow, /npm ci[\s\S]*playwright install --with-deps chromium webkit[\s\S]*npm run check/)
    assert.match(workflow, /git fetch origin main\s+test "\$\(git rev-parse HEAD\)" = "\$\(git rev-parse origin\/main\)"/)
    const publish = name === 'cloudflare' ? workflow.indexOf('wrangler deploy') : workflow.indexOf('actions/upload-pages-artifact')
    assert.ok(publish > workflow.indexOf('refuse a superseded release'))
  }
})

test('the check path reaches strict types, emitted-artifact units and both real browser engines', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  assert.equal(pkg.scripts.check, 'npm run typecheck && npm test && npm run test:oracle && npm run test:mutations && npm run test:e2e')
  assert.equal(pkg.scripts['test:oracle'], 'node tools/oracle/run.mjs')
  assert.equal(pkg.scripts['test:mutations'], 'node tools/oracle/mutants.mjs')
  assert.match(pkg.scripts.typecheck, /svelte-check.*--fail-on-warnings/)
  assert.match(pkg.scripts.test, /npm run build && node --test tests\/\*\.test\.mjs/)
  assert.match(pkg.scripts['test:e2e'], /npm run build && node tools\/build-harness\.mjs && playwright test/)
  const ci = await readFile('.github/workflows/ci.yml', 'utf8')
  assert.match(ci, /fetch-depth: 0/)
  assert.match(ci, /npm run check/)
  const browsers = await readFile('playwright.config.mjs', 'utf8')
  assert.match(browsers, /browserName: 'chromium'/)
  assert.match(browsers, /browserName: 'webkit'/)
  assert.match(browsers, /JUMPIT_ROOT \|\| 'build'/)
})
