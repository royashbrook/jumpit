import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { releaseIdentity } from '../tools/version.mjs'

const releaseError = {
  name: 'Error',
  message: 'Release requires a clean tree, complete history and a vMAJOR.MINOR milestone.',
}

async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'jumpit-version-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cwd = join(root, 'repository')
  await mkdir(cwd)
  const git = (...args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.name', 'Jumpit version tests')
  git('config', 'user.email', 'version-tests@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'tag.gpgsign', 'false')
  git('config', 'core.hooksPath', join(root, 'no-hooks'))
  await writeFile(join(cwd, 'README.md'), 'temporary release identity fixture\n')
  git('add', 'README.md')
  const commit = message => git('commit', '--quiet', '--allow-empty', '-m', message)
  commit('initial')
  return { root, cwd, git, commit }
}

for (const annotated of [false, true]) {
  test(`${annotated ? 'annotated' : 'lightweight'} milestones choose the nearest first-parent tag`, async t => {
    const repo = await repository(t)
    repo.git('tag', 'v9.9')
    repo.commit('nearer milestone')
    if (annotated) repo.git('tag', '-a', 'v2.1', '-m', 'milestone')
    else repo.git('tag', 'v2.1')
    assert.equal(releaseIdentity(repo.cwd, true).version, '2.1.0')
    repo.commit('after milestone')
    const expected = {
      version: '2.1.1',
      source: repo.git('rev-parse', 'HEAD'),
      dirty: false,
      anchor: 'v2.1',
    }
    assert.deepEqual(releaseIdentity(repo.cwd, true), expected)
    assert.deepEqual(releaseIdentity(repo.cwd), { ...expected, version: '2.1.1-dev' })
  })
}

test('merge patches count every reachable commit while newer side-branch tags are ignored', async t => {
  const repo = await repository(t)
  repo.git('tag', 'v2.1')
  repo.git('switch', '--quiet', '-c', 'feature')
  repo.commit('feature one')
  repo.git('tag', '-a', 'v8.4', '-m', 'off first parent')
  repo.commit('feature two')
  repo.git('switch', '--quiet', 'main')
  repo.commit('main one')
  repo.git('merge', '--quiet', '--no-ff', 'feature', '-m', 'merge feature')
  assert.equal(repo.git('rev-list', '--first-parent', 'v2.1..HEAD', '--count'), '2')
  assert.deepEqual(releaseIdentity(repo.cwd, true), {
    version: '2.1.4',
    source: repo.git('rev-parse', 'HEAD'),
    dirty: false,
    anchor: 'v2.1',
  })
})

test('malformed milestones do not become anchors or enable a package-version release fallback', async t => {
  const repo = await repository(t)
  await writeFile(join(repo.cwd, 'package.json'), JSON.stringify({ version: '99.88.77' }))
  repo.git('add', 'package.json')
  repo.commit('unrelated package version')
  for (const tag of ['v2.1.0', 'v02.1', 'v2.01', '2.1', 'v2', 'v2.1-beta', 'v2.1.0-dev']) {
    repo.git('tag', tag)
  }
  assert.deepEqual(releaseIdentity(repo.cwd), {
    version: '2.1.0-dev',
    source: repo.git('rev-parse', 'HEAD'),
    dirty: false,
    anchor: null,
  })
  assert.throws(() => releaseIdentity(repo.cwd, true), releaseError)
  repo.git('tag', 'v0.0')
  repo.commit('after valid zero milestone')
  repo.git('tag', 'v99.99.99')
  assert.equal(releaseIdentity(repo.cwd, true).version, '0.0.1')
  assert.equal(releaseIdentity(repo.cwd, true).anchor, 'v0.0')
})

test('a valid tag reachable only through a merge parent is still no first-parent anchor', async t => {
  const repo = await repository(t)
  repo.git('switch', '--quiet', '-c', 'feature')
  repo.commit('feature milestone')
  repo.git('tag', 'v3.4')
  repo.git('switch', '--quiet', 'main')
  repo.commit('main continues')
  repo.git('merge', '--quiet', '--no-ff', 'feature', '-m', 'merge without main milestone')
  assert.equal(releaseIdentity(repo.cwd).anchor, null)
  assert.equal(releaseIdentity(repo.cwd).version, '2.1.0-dev')
  assert.throws(() => releaseIdentity(repo.cwd, true), releaseError)
})

for (const tracked of [true, false]) {
  test(`${tracked ? 'tracked changes' : 'untracked files'} refuse a release but remain visible in dev identity`, async t => {
    const repo = await repository(t)
    repo.git('tag', 'v2.1')
    await writeFile(join(repo.cwd, tracked ? 'README.md' : 'untracked.txt'), 'dirty fixture\n')
    assert.deepEqual(releaseIdentity(repo.cwd), {
      version: '2.1.0-dev',
      source: repo.git('rev-parse', 'HEAD'),
      dirty: true,
      anchor: 'v2.1',
    })
    assert.throws(() => releaseIdentity(repo.cwd, true), releaseError)
  })
}

test('a shallow clone refuses release even with a clean tagged HEAD', async t => {
  const repo = await repository(t)
  repo.commit('tip milestone')
  repo.git('tag', 'v2.1')
  const shallow = join(repo.root, 'shallow')
  repo.git('clone', '--quiet', '--depth', '1', '--branch', 'main', pathToFileURL(repo.cwd).href, shallow)
  assert.deepEqual(releaseIdentity(shallow), {
    version: '2.1.0-dev',
    source: repo.git('rev-parse', 'HEAD'),
    dirty: false,
    anchor: 'v2.1',
  })
  assert.throws(() => releaseIdentity(shallow, true), releaseError)
})

test('identity is deterministic for the same Git state and needs no package metadata', async t => {
  const repo = await repository(t)
  repo.git('tag', '-a', 'v2.1', '-m', 'stable identity')
  repo.commit('first patch')
  const expected = releaseIdentity(repo.cwd, true)
  for (let index = 0; index < 3; index += 1) {
    assert.deepEqual(releaseIdentity(repo.cwd, true), expected)
  }
  assert.equal(expected.version, '2.1.1')
})

test('Git errors propagate instead of pretending that an invalid repository is a dev release', async t => {
  const repo = await repository(t)
  assert.throws(() => releaseIdentity(repo.root), error => {
    assert.equal(error.status, 128)
    assert.match(error.stderr, /not a git repository/)
    return true
  })
})
