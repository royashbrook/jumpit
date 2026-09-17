// Shared helpers: the pinned reference release, a temporary git worktree of it, and recording.
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
export const repo = resolve(here, '../..')
export const REFERENCE = '25abd61230184517c85a7b5f381ad25988c81989'
// The old game's Math.sin differs by one ulp across these platforms. Compare old/new exactly
// on the SAME runtime, with separately measured pins. No rounding or gameplay exceptions.
// darwin-arm64: independent pre-port recorder + integrated recorder, Node 22.23.2 / 26.8.2.
// linux-x64: Node 22.23.2, runs 35247033841, 35247868083 and 35247863325, original tree.
const REFERENCE_HASHES = {
  'darwin-arm64': '31548e207fb4592844ff7b7e59180ac1aa4563ffd618bff5d46fe3810ef82060',
  'linux-x64': 'e4d7672571b72c8d4230dcf7f65b5f254a9b6df150adc739e413e0f8505bae05',
}

export function assertReferenceHash(hash, platform = `${process.platform}-${process.arch}`) {
  const expected = REFERENCE_HASHES[platform]
  if (!Object.hasOwn(REFERENCE_HASHES, platform)) {
    throw new Error(`unmeasured reference platform ${platform}: got ${hash}. Measure the original release before adding a pin.`)
  }
  if (hash !== expected) {
    throw new Error(`reference recording drifted on ${platform}: expected ${expected}, got ${hash}. The recorder or the runtime changed, not the port.`)
  }
}

export function contentHash(recording) {
  const copy = { ...recording }
  delete copy.meta
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex')
}

export function record(root, pathsFile) {
  const out = join(mkdtempSync(join(tmpdir(), 'jumpit-oracle-rec-')), 'recording.json')
  const args = [join(here, 'record.mjs'), root, out]
  if (pathsFile) args.push(pathsFile)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  if (r.error || r.signal || r.status !== 0) {
    throw new Error(`recording ${root} failed: status ${r.status}, signal ${r.signal ?? 'none'}\n${r.error?.message ?? ''}${r.stderr ?? ''}`)
  }
  try { return JSON.parse(readFileSync(out, 'utf8')) } finally { rmSync(dirname(out), { recursive: true, force: true }) }
}

export function withReference(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'jumpit-oracle-ref-'))
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', dir, REFERENCE], { stdio: 'pipe' })
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw new Error(`reference ${REFERENCE} is not available in this clone. Fetch full history (actions/checkout fetch-depth: 0).\n${error.stderr ?? error.message}`)
  }
  const cleanup = () => {
    execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', dir], { stdio: 'pipe' })
    rmSync(dir, { recursive: true, force: true })
  }
  let result
  try {
    result = fn(dir)
  } catch (error) {
    cleanup()
    throw error
  }
  // an async callback must finish before the worktree is removed
  if (result && typeof result.then === 'function') return result.finally(cleanup)
  cleanup()
  return result
}

export function referenceRecording(dir) {
  const recording = record(dir)
  const hash = contentHash(recording)
  assertReferenceHash(hash)
  return recording
}
