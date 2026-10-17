// public/audio/manifest.json (FROZEN): { version: 1, sfx: { id: path }, music: { mood: path }, voice: { id: path } }.
// Paths are relative to import.meta.env.BASE_URL. A missing or malformed manifest means everything stays synthesised.
export type AudioKind = 'sfx' | 'music' | 'voice'
export interface AudioManifest { version: 1; sfx: Record<string, string>; music: Record<string, string>; voice: Record<string, string> }

export const EMPTY_MANIFEST: AudioManifest = { version: 1, sfx: {}, music: {}, voice: {} }
export const MANIFEST_PATH = 'audio/manifest.json'

/** Sfx ids with no synth recipe of their own that borrow another recipe until their file exists. */
export const SFX_ALIASES: Readonly<Record<string, string>> = {
  'death-human': 'death', 'death-mutant': 'death', 'death-dog': 'death', 'death-deathclaw': 'death', 'death-robot': 'death',
  radiation: 'geiger',
}

/** A relative path inside the site: no scheme, no leading slash, no parent steps. Anything else is ignored. */
function safePath(p: unknown): string | null {
  if (typeof p !== 'string') return null
  const t = p.trim()
  if (!t || t.startsWith('/') || t.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(t)) return null
  if (t.split('/').some((seg) => seg === '..')) return null
  return t
}

function section(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, p] of Object.entries(raw as Record<string, unknown>)) {
    const path = safePath(p)
    if (path) out[id] = path
  }
  return out
}

/** Tolerant parse: anything that is not a version 1 object yields the empty manifest; bad entries are dropped. */
export function parseManifest(raw: unknown): AudioManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_MANIFEST
  const o = raw as Record<string, unknown>
  if (o.version !== 1) return EMPTY_MANIFEST
  return { version: 1, sfx: section(o.sfx), music: section(o.music), voice: section(o.voice) }
}

export function resolveAudioUrl(base: string, rel: string): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${rel}`
}

/** Voice id for the round banner: the last round wins over its number; rounds past 4 have no line. */
export function roundVoiceId(round: number, maxRounds: number | null | undefined): string | null {
  if (maxRounds != null && maxRounds > 1 && round === maxRounds) return 'last-round'
  return round >= 1 && round <= 4 ? `round-${round}` : null
}
