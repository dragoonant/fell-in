// npm run validate:data -> validates every data/<edition>/**/*.json against spec 20.
// Exits 1 with one readable line per problem.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildBundles, type RawFile } from '../src/data/bundle'
import { formatError, validateBundle, validateEditions, type ValidationError } from '../src/data/validate'
import type { EditionBundle } from '../src/data/types'
import { isCampaignPath, splitCampaign } from '../src/data/campaign'
import { campaignStatsOf, validateCampaign, type CampaignStats } from '../src/data/campaign-validate'

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

/** Campaign checks (spec 20 "Campaign records", M6): every data/<edition>/campaign/ folder against the campaign validator. */
export function checkCampaign(raw: RawFile[], bundles: Record<string, EditionBundle>): { errs: ValidationError[]; stats: Record<string, CampaignStats> } {
  const errs: ValidationError[] = []
  const stats: Record<string, CampaignStats> = {}
  const { byEdition, problems } = splitCampaign(raw)
  for (const p of problems) errs.push({ file: p.file, id: '-', path: '', message: p.message })
  for (const [edition, files] of Object.entries(byEdition)) {
    const scenarioIds = new Set((bundles[edition]?.records.scenarios ?? []).map((s) => s.id))
    errs.push(...validateCampaign(edition, files, scenarioIds))
    stats[edition] = campaignStatsOf(files)
  }
  return { errs, stats }
}

let lastStats: Record<string, CampaignStats> = {}
/** Campaign record and placeholder counts from the last validateDataDir() call (printed by the CLI). */
export const campaignStats = (): Record<string, CampaignStats> => lastStats

/** Validate a data tree on disk. Returns every problem; empty = valid. */
export function validateDataDir(dir: string = DATA_DIR): ValidationError[] {
  const errs: ValidationError[] = []
  const files: RawFile[] = []
  const campaignFiles: RawFile[] = []
  let editions: unknown
  for (const abs of walk(dir)) {
    const path = relative(dir, abs).split('\\').join('/')
    let json: unknown
    try { json = JSON.parse(readFileSync(abs, 'utf8')) } catch (e) {
      errs.push({ file: path, id: '-', path: '', message: `invalid JSON: ${(e as Error).message}` }); continue
    }
    if (path === 'editions.json') editions = json
    else if (isCampaignPath(path)) campaignFiles.push({ path, json })
    else files.push({ path, json })
  }
  if (editions === undefined) errs.push({ file: 'editions.json', id: '-', path: '', message: 'is missing' })
  const { bundles, problems } = buildBundles(files)
  for (const p of problems) errs.push({ file: p.file, id: '-', path: '', message: p.message })
  if (editions !== undefined) errs.push(...validateEditions(editions, Object.keys(bundles)))
  for (const b of Object.values(bundles)) errs.push(...validateBundle(b), ...checkBriefings(b))
  const camp = checkCampaign(campaignFiles, bundles)
  errs.push(...camp.errs)
  lastStats = camp.stats
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
  for (const [edition, st] of Object.entries(campaignStats())) {
    const total = Object.values(st.records).reduce((a, b) => a + b, 0)
    const ph = Object.entries(st.placeholders).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(', ')
    console.log(`validate:data: campaign ${edition}: ${total} records, ${st.hooks} hooks, placeholders: ${ph || 'none'}`)
  }
  console.log('validate:data: ok')
}
