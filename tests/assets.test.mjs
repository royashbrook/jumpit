import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootUrl = new URL('../', import.meta.url)
const root = dirname(dirname(fileURLToPath(import.meta.url)))

async function walk(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(relative(root, path))
  }
  return files.sort()
}

function webpInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const data = offset + 8
    if (type === 'VP8X') {
      return {
        width: 1 + bytes.readUIntLE(data + 4, 3),
        height: 1 + bytes.readUIntLE(data + 7, 3),
        alpha: Boolean(bytes[data] & 0x10),
      }
    }
    if (type === 'VP8L') {
      assert.equal(bytes[data], 0x2f)
      const bits = bytes.readUInt32LE(data + 1)
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
        alpha: Boolean(bits & 0x10000000),
      }
    }
    if (type === 'VP8 ') {
      assert.deepEqual([...bytes.subarray(data + 3, data + 6)], [0x9d, 0x01, 0x2a])
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
        alpha: false,
      }
    }
    offset = data + size + (size % 2)
  }
  assert.fail('WebP carries no decodable image chunk')
}

function imageInfo(bytes, file) {
  if (file.endsWith('.webp')) return webpInfo(bytes)
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a')
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    alpha: [4, 6].includes(bytes[25]),
  }
}

test('generated and derived art has a closed, hash-verified provenance manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('assets/manifest.json', rootUrl), 'utf8'))
  assert.equal(manifest.schema, 1)
  const declared = manifest.assets.map(asset => asset.file).sort()
  const rootIcons = (await readdir(root))
    .filter(file => /^icon-(?:180|192|512|maskable-512)\.png$/.test(file))
  const present = [
    ...(await walk(join(root, 'assets'))).filter(file => /\.(?:png|webp)$/.test(file)),
    ...rootIcons,
  ].sort()
  assert.deepEqual(declared, present)
  assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, manifest.assets.length)
  const declaredSet = new Set(declared)
  let shippedArtBytes = 0

  for (const asset of manifest.assets) {
    assert.match(asset.file, /^(?:assets\/|icon-(?:180|192|512|maskable-512)\.png$)/)
    assert.ok(asset.prompt.length > 30)
    assert.equal(asset.license, 'project-original')
    const bytes = await readFile(new URL(asset.file, rootUrl))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, asset.file)
    const info = imageInfo(bytes, asset.file)
    assert.equal(`${info.width}x${info.height}`, asset.dimensions, asset.file)
    if (asset.kind.includes('sprite-sheet')) assert.equal(info.alpha, true, `${asset.file} must carry real alpha`)
    if (asset.derivedFrom) {
      assert.ok(declaredSet.has(asset.derivedFrom), `${asset.file} must name a declared source image`)
      assert.ok(asset.transform?.length > 20, `${asset.file} must record its exact transform`)
      if (asset.file.endsWith('.webp')) {
        const expected = asset.kind.includes('sprite-sheet')
          ? `cwebp 1.6.0 -lossless -m 6 -resize 768 512 ${asset.derivedFrom} -o ${asset.file}`
          : `cwebp 1.6.0 -q 82 -m 6 -sharp_yuv ${asset.derivedFrom} -o ${asset.file}`
        assert.equal(asset.transform, expected, asset.file)
      } else if (/^icon-\d+\.png$/.test(asset.file)) {
        const size = asset.dimensions.split('x')[0]
        assert.equal(asset.transform, `sips -z ${size} ${size} ${asset.derivedFrom} --out ${asset.file}`)
      } else if (asset.file === 'icon-maskable-512.png') {
        assert.equal(asset.transform, `sips -z 512 512 ${asset.derivedFrom} --out icon-maskable-512.png`)
      }
    }
    if (asset.source.includes('style reference')) {
      const reference = manifest.assets.find(candidate => candidate.file === asset.styleReference?.file)
      assert.ok(reference, `${asset.file} must identify its declared style reference`)
      assert.equal(asset.styleReference.sha256, reference.sha256, `${asset.file} must pin its style reference hash`)
    }
    if (asset.file.endsWith('.webp')) {
      shippedArtBytes += bytes.length
    }
  }

  assert.equal(shippedArtBytes, 2_104_068)
  assert.ok(shippedArtBytes <= 2_150_000)
})
