// Optimises public/assets/models/*.glb in place: dedup + prune + weld, textures to webp (<= 1024 px), meshopt-compressed geometry.
// Shapes are untouched (weld only merges identical vertices; quantisation is 14-bit positions). The loader already sets MeshoptDecoder.
// Usage: npm run models:optimize [-- --size 1024 --quality 80 --dir public/assets/models]
// Idempotent in structure; re-running re-encodes the (already lossy) webp textures, so keep the Hunyuan originals if you want to re-tune quality.
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const SIZE = Number(opt('size', 1024))
const QUALITY = Number(opt('quality', 72))
const DIR = resolve(opt('dir', 'public/assets/models'))

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

const files = (await readdir(DIR)).filter((f) => f.endsWith('.glb')).sort()
let before = 0
let after = 0
for (const f of files) {
  const p = join(DIR, f)
  const b = (await stat(p)).size
  const doc = await io.read(p)
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [SIZE, SIZE], quality: QUALITY }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
  const out = await io.writeBinary(doc)
  await writeFile(p, out)
  before += b
  after += out.byteLength
  console.log(`${f.padEnd(24)} ${(b / 1024).toFixed(0).padStart(6)} KB -> ${(out.byteLength / 1024).toFixed(0).padStart(5)} KB`)
}
console.log(`${files.length} models: ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB`)
