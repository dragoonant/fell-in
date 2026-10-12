// npm run validate:data -> validates every data/<edition>/**/*.json against spec 20.
// Exits 1 with one readable line per problem.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildBundles, type RawFile } from '../src/data/bundle'
import { formatError, validateBundle, validateEditions, type ValidationError } from '../src/data/validate'

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

/** Validate a data tree on disk. Returns every problem; empty = valid. */
export function validateDataDir(dir: string = DATA_DIR): ValidationError[] {
  const errs: ValidationError[] = []
  const files: RawFile[] = []
  let editions: unknown
  for (const abs of walk(dir)) {
    const path = relative(dir, abs).split('\\').join('/')
    let json: unknown
    try { json = JSON.parse(readFileSync(abs, 'utf8')) } catch (e) {
      errs.push({ file: path, id: '-', path: '', message: `invalid JSON: ${(e as Error).message}` }); continue
    }
    if (path === 'editions.json') editions = json
    else files.push({ path, json })
  }
  if (editions === undefined) errs.push({ file: 'editions.json', id: '-', path: '', message: 'is missing' })
  const { bundles, problems } = buildBundles(files)
  for (const p of problems) errs.push({ file: p.file, id: '-', path: '', message: p.message })
  if (editions !== undefined) errs.push(...validateEditions(editions, Object.keys(bundles)))
  for (const b of Object.values(bundles)) errs.push(...validateBundle(b))
  return errs
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  const errs = validateDataDir()
  if (errs.length) {
    for (const e of errs) console.error(formatError(e))
    console.error(`validate:data: ${errs.length} problem(s)`)
    process.exit(1)
  }
  console.log('validate:data: ok')
}
