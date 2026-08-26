import { proveFinishable } from '../engine/solvability.js'
import { LEVELS } from '../levels.js'

let failed = false
for (const level of LEVELS) {
  const result = proveFinishable(level)
  const mark = result.finishable ? 'PASS' : 'FAIL'
  console.log(`${mark}  ${level.id.padEnd(12)} ${String(result.frames).padStart(4)} frames  ${String(result.jumps).padStart(2)} jumps`)
  failed ||= !result.finishable
}
if (failed) process.exitCode = 1
