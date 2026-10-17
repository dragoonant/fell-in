// Campaign data, pure part (M6; spec 20 "Campaign records"): splits the data/<edition>/campaign/*.json files out of a raw
// file list and builds typed record lists. No Vite and no fs, so Node tools and tests can use it; the Vite loader is
// campaign-loader.ts. The main bundle builder (bundle.ts) ignores the campaign folder, so nothing here changes it.
import type { RawFile } from './bundle'
import type { EditionBundle } from './types'
import { CAMPAIGN_KINDS, type CampaignFile, type CampaignFiles, type CampaignKind, type CampaignRecords } from './campaign-types'

export * from './campaign-types'

const CAMPAIGN_PATH = /^([^/]+)\/campaign\/([a-z-]+)\.json$/

/** True for a path (relative to data/) that belongs to the campaign folder of an edition. */
export const isCampaignPath = (path: string): boolean => /^[^/]+\/campaign\//.test(path)

/** Group the campaign files of every edition. Unknown file names are returned as problems, never dropped silently. */
export function splitCampaign(files: RawFile[]): { byEdition: Record<string, CampaignFiles>; problems: { file: string; message: string }[] } {
  const byEdition: Record<string, CampaignFiles> = {}
  const problems: { file: string; message: string }[] = []
  for (const { path, json } of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!isCampaignPath(path)) continue
    const m = CAMPAIGN_PATH.exec(path)
    if (!m) { problems.push({ file: path, message: 'campaign files must be data/<edition>/campaign/<kind>.json' }); continue }
    const kind = m[2] as CampaignKind
    if (!CAMPAIGN_KINDS.includes(kind)) { problems.push({ file: path, message: `unknown campaign file "${m[2]}" (expected ${CAMPAIGN_KINDS.join(', ')})` }); continue }
    ;(byEdition[m[1]] ??= {})[kind] = json
  }
  return { byEdition, problems }
}

/** Typed record lists of one edition; a missing or malformed file reads as an empty list (the validator reports it). */
export function campaignRecords(files: CampaignFiles): CampaignRecords {
  const list = (k: CampaignKind) => {
    const f = files[k] as Partial<CampaignFile> | undefined
    return (f && Array.isArray(f.records) ? f.records : []) as never
  }
  return Object.fromEntries(CAMPAIGN_KINDS.map((k) => [k, list(k)])) as unknown as CampaignRecords
}

/** The hook names a file declares (name -> one-line description). */
export function campaignHooks(files: CampaignFiles): Record<string, Record<string, string>> {
  return Object.fromEntries(CAMPAIGN_KINDS.map((k) => [k, ((files[k] as Partial<CampaignFile> | undefined)?.hooks ?? {})]))
}

/**
 * An edition bundle with the campaign records attached for src/campaign/data.ts: `records.perks` is filled (the
 * existing "perks" kind) and every kind is also under `records.campaign`. The input bundle is not changed.
 */
export type CampaignBundle = EditionBundle & { records: EditionBundle['records'] & { campaign: CampaignRecords } }
export function withCampaign(bundle: EditionBundle, files: CampaignFiles): CampaignBundle {
  const c = campaignRecords(files)
  return { ...bundle, records: { ...bundle.records, perks: c.perks, campaign: c } }
}

const by = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((r) => [r.id, r]))
/** Id lookups over a CampaignRecords set. */
export function campaignIndex(c: CampaignRecords) {
  const maps = { structures: by(c.structures), perks: by(c.perks), boosts: by(c.boosts), events: by(c.events), quests: by(c.quests), explore: by(c.explore), injuries: by(c.injuries), 'caps-awards': by(c['caps-awards']) }
  return {
    get<K extends CampaignKind>(kind: K, id: string): CampaignRecords[K][number] | undefined { return maps[kind].get(id) as never },
    require<K extends CampaignKind>(kind: K, id: string): CampaignRecords[K][number] {
      const r = maps[kind].get(id)
      if (!r) throw new Error(`no ${kind} record "${id}"`)
      return r as never
    },
  }
}

/**
 * Boosts a rack of `type` may draw. A Boost whose type is not sourced yet (typeUnknown) counts for every typed rack, so a
 * typed rack never runs dry (RULING: Boost types, data/1e/campaign/boosts.json); type undefined = the "any" rack.
 */
export function boostsForRack(boosts: CampaignRecords['boosts'], type?: string): CampaignRecords['boosts'] {
  return type === undefined ? boosts : boosts.filter((b) => b.type === type || b.typeUnknown === true)
}

/** The default caps award, then a scenario's own record when it has one (CH p19). */
export function awardFor(awards: CampaignRecords['caps-awards'], scenarioId?: string) {
  const own = scenarioId === undefined ? undefined : awards.find((a) => a.scenarioId === scenarioId)
  const def = awards.find((a) => a.scenarioId === undefined)
  return { own, default: def }
}
