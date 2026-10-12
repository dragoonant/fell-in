// Builds EditionBundles from raw JSON files. Pure: used by the Vite loader (index.ts) and the
// Node validator (tools/validate-data.ts). Paths are relative to data/, with forward slashes.
import { KINDS, SINGLETONS, type EditionBundle, type Kind, type SingletonName } from './types'

export interface RawFile { path: string; json: unknown }
export interface BundleProblem { file: string; message: string }

export function emptyBundle(edition: string): EditionBundle {
  const records = Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as EditionBundle['records']
  return { edition, records, singletons: {}, origin: {} }
}

/** Group raw files under data/<edition>/... into bundles. editions.json at the root is skipped. */
export function buildBundles(files: RawFile[]): { bundles: Record<string, EditionBundle>; problems: BundleProblem[] } {
  const bundles: Record<string, EditionBundle> = {}
  const problems: BundleProblem[] = []
  for (const { path, json } of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = path.split('/')
    if (parts.length === 1) {
      if (parts[0] !== 'editions.json') problems.push({ file: path, message: 'unexpected file at data/ root' })
      continue
    }
    const edition = parts[0]
    const bundle = (bundles[edition] ??= emptyBundle(edition))
    if (parts.length === 2) {
      const name = parts[1].replace(/\.json$/, '') as SingletonName
      if (!SINGLETONS.includes(name)) { problems.push({ file: path, message: `unknown root file (expected ${SINGLETONS.join(', ')})` }); continue }
      if (Array.isArray(json) || typeof json !== 'object' || json === null) { problems.push({ file: path, message: 'singleton file must hold one object' }); continue }
      ;(bundle.singletons as Record<string, unknown>)[name] = json
      const id = (json as { id?: unknown }).id
      if (typeof id === 'string') bundle.origin[id] ??= path
      continue
    }
    const kind = parts[1] as Kind
    if (!KINDS.includes(kind)) { problems.push({ file: path, message: `unknown folder "${parts[1]}" (expected ${KINDS.join(', ')})` }); continue }
    const list = Array.isArray(json) ? json : [json]
    for (const rec of list) {
      ;(bundle.records[kind] as unknown[]).push(rec)
      const id = (rec as { id?: unknown } | null)?.id
      if (typeof id === 'string') bundle.origin[id] ??= path
    }
  }
  return { bundles, problems }
}
