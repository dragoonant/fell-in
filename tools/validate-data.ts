// npm run validate:data -> validates every data/<edition>/**/*.json against spec 20.
// Exits 1 with one readable line per problem.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildBundles, type RawFile } from '../src/data/bundle'
import { formatError, validateBundle, validateEditions, type ValidationError } from '../src/data/validate'
import type { EditionBundle } from '../src/data/types'

export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Briefing checks (spec 20 s3.1, M4c): every scenario carries a briefing with a goal for each of its sides. */
export function checkBriefings(b: EditionBundle): ValidationError[] {
  const errs: ValidationError[] = []
  for (const s of b.records.scenarios) {
    const file = b.origin[s.id] ?? b.edition
    const err = (path: string, message: string) => errs.push({ file, id: s.id, path, message })
    const br: unknown = (s as { briefing?: unknown }).briefing
    if (!isPlain(br)) { err('briefing', 'is missing (every scenario needs a briefing)'); continue }
    if (!nonEmpty(br.story)) err('briefing.story', 'must be a non-empty string')
    const sideIds = (Array.isArray(s.sides) ? s.sides : []).map((x) => x.id)
    if (!isPlain(br.goals)) err('briefing.goals', 'must be an object keyed by side id')
    else {
      for (const id of sideIds) if (!nonEmpty(br.goals[id])) err(`briefing.goals.${id}`, 'missing goal for this side')
      for (const k of Object.keys(br.goals)) if (!sideIds.includes(k)) err(`briefing.goals.${k}`, 'is not a side of this scenario')
    }
    const list = (v: unknown, path: string, min: number, max: number) => {
      if (!Array.isArray(v) || v.length < min || v.length > max) err(path, `must be a list of ${min}-${max} strings`)
      else v.forEach((x, i) => { if (!nonEmpty(x)) err(`${path}[${i}]`, 'must be a non-empty string') })
    }
    list(br.howToWin, 'briefing.howToWin', 2, 5)
    list(br.tips, 'briefing.tips', 1, 3)
  }
  return errs
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
  for (const b of Object.values(bundles)) errs.push(...validateBundle(b), ...checkBriefings(b))
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
