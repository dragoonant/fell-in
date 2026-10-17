// Optional artwork: every image hides itself when its file is missing, so the plain UI shows through.
import { useMemo, useState } from 'react'
import { useBundle, usePresented } from '../contract'
import { factionWord, markArtUrl, portraitArtUrl, portraitSwatch, seatFactions } from './artView'

/** An <img> that renders nothing once it fails to load (and tries again if `src` changes). */
export function ArtImage({ src, className, testId }: { src: string | null; className?: string; testId?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) return null
  return <img className={className} src={src} alt="" draggable={false} data-testid={testId} onError={() => setFailed(src)} />
}

/** Unit portrait (256x256 art) over a procedural faction-coloured swatch with the unit's initial. */
export function Portrait({ unitId, faction, name, size = 48 }: { unitId: string; faction?: string | null; name: string; size?: number }) {
  const sw = portraitSwatch(faction, name)
  return (
    <span className="portrait" data-testid="portrait" style={{ width: size, height: size, background: sw.background, fontSize: Math.round(size * 0.5) }}>
      <span aria-hidden="true">{sw.letter}</span>
      <ArtImage src={portraitArtUrl(unitId)} className="portrait-img" />
    </span>
  )
}

/** Small faction emblem (art/marks/<faction>.svg); nothing when the faction is unknown or the file is missing. */
export function FactionMark({ faction, size = 16 }: { faction: string | null | undefined; size?: number }) {
  const src = markArtUrl(faction)
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || !faction || failed === src) return null
  return <img className="fmark" src={src} width={size} height={size} alt="" title={factionWord(faction)} draggable={false} data-testid="faction-mark" onError={() => setFailed(src)} />
}

/** Seat id -> faction id for the running game. */
export function useSeatFactions(): Record<string, string> {
  const state = usePresented()
  const bundle = useBundle()
  const models = state?.models
  return useMemo(() => (models && bundle ? seatFactions(models, bundle.records.units) : {}), [models, bundle])
}
