// The campaign save: one campaign at a time under the key "fell-in.campaign.v1" (CAMP-017, spec 19 s7). The key is versioned
// and the record carries `version`; a save from another edition or an unknown version is refused with a message, never
// migrated silently (spec 20). Storage goes through the client's try/catch wrapper, so node tests fall back to memory.
import { readRaw, removeKey, writeRaw } from '../client/store/storage'
import type { Campaign } from './types'

export const STORE_KEY = 'fell-in.campaign.v1'
export const SAVE_VERSION = 1
/** Saves stay small (spec 00 s11): above this the oldest log payloads are dropped. */
export const MAX_SAVE_BYTES = 64 * 1024

export type LoadResult =
  | { ok: true; campaign: Campaign }
  | { ok: false; reason: 'none' | 'corrupt' | 'version' | 'edition'; message: string }

/** Longest text an old log entry keeps once the save is compacted. */
const COMPACT_TEXT = 160

/**
 * Shrink old log entries so the save stays small: other payload keys go and long text is cut, but `data.action` always stays,
 * because the actions are the replay script that rebuilds the campaign from its seed (CAMP-008, spec 00 s11).
 */
export function compactLog(c: Campaign, keep = 100): Campaign {
  const log = c.log.map((e, i): Campaign['log'][number] => {
    if (i >= c.log.length - keep) return e
    const text = e.text.length > COMPACT_TEXT ? `${e.text.slice(0, COMPACT_TEXT - 1)}…` : e.text
    const action = e.data?.action
    return { round: e.round, seat: e.seat, type: e.type, text, ...(action !== undefined ? { data: { action } } : {}) }
  })
  return { ...c, log }
}

/** Migration stub: version 1 is current. Every later format change adds a step here (never silent for an unknown version). */
export function migrate(raw: unknown): { campaign: Campaign } | { error: 'version' | 'corrupt'; message: string } {
  if (!raw || typeof raw !== 'object') return { error: 'corrupt', message: 'The saved campaign is not readable.' }
  const v = (raw as { version?: unknown }).version
  if (v === SAVE_VERSION) return { campaign: raw as Campaign }
  return { error: 'version', message: `The saved campaign is version ${String(v)}; this build reads version ${SAVE_VERSION}.` }
}

export function loadCampaign(edition?: string): LoadResult {
  const text = readRaw(STORE_KEY)
  if (text === null) return { ok: false, reason: 'none', message: 'No saved campaign.' }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, reason: 'corrupt', message: 'The saved campaign is not readable.' } }
  const m = migrate(raw)
  if ('error' in m) return { ok: false, reason: m.error, message: m.message }
  if (edition && m.campaign.edition !== edition) return { ok: false, reason: 'edition', message: `The saved campaign uses edition ${m.campaign.edition}; this game is on ${edition}.` }
  return { ok: true, campaign: m.campaign }
}

/** Save (compacting the log when over the size budget). Returns false when storage refused the write. */
export function saveCampaign(c: Campaign): boolean {
  let text = JSON.stringify(c)
  if (text.length > MAX_SAVE_BYTES) text = JSON.stringify(compactLog(c))
  return writeRaw(STORE_KEY, text)
}

export const hasSavedCampaign = (): boolean => readRaw(STORE_KEY) !== null
export const clearCampaign = (): void => removeKey(STORE_KEY)

/** Start a new campaign. When one is saved, `confirmReplace` must say yes first (CAMP-017). Returns whether it was saved. */
export function startNewCampaign(c: Campaign, confirmReplace: () => boolean): boolean {
  if (hasSavedCampaign() && !confirmReplace()) return false
  return saveCampaign(c)
}
