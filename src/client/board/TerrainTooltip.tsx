// Hover tooltip for terrain: the piece's name and what it does to movement, sight and defence.
import { useEffect, useMemo, type ReactElement } from 'react'
import { dataName, usePresented } from '../contract'
import { clampTooltipLeft } from './layout'
import { terrainInfo } from './terrainInfo'
import { clearTerrainHover, useTerrainHover } from './terrainHover'

export function TerrainTooltip(): ReactElement | null {
  const { id, x, y } = useTerrainHover()
  useEffect(() => {
    if (!id) return
    const off = () => clearTerrainHover()
    window.addEventListener('pointerdown', off, { capture: true })
    return () => window.removeEventListener('pointerdown', off, { capture: true })
  }, [id])
  const state = usePresented()
  const piece = useMemo(() => (id ? state?.terrain.find((t) => t.id === id) : undefined), [id, state?.terrain])
  const info = useMemo(() => (piece ? terrainInfo(piece) : null), [piece])
  if (!piece || !info) return null
  const left = clampTooltipLeft(x, typeof window === 'undefined' ? 1280 : window.innerWidth)
  return (
    <div data-testid="terrain-tooltip" role="tooltip" style={{
      position: 'fixed', left, top: y + 18, width: 260, pointerEvents: 'none', zIndex: 30, background: '#1d1a16f2', color: '#ece3d0',
      border: '1px solid #c9ad7c88', borderRadius: 8, padding: '8px 10px', font: '13px/1.35 system-ui', boxShadow: '0 4px 14px #0008',
    }}>
      <div style={{ font: '600 14px system-ui', color: '#d8c49a' }} data-testid="terrain-tooltip-name">{dataName(piece.pieceId)}</div>
      <div style={{ opacity: 0.7, marginBottom: 4 }} data-testid="terrain-tooltip-kind">{info.kind}</div>
      {info.lines.map((l, i) => <div key={i} style={{ marginTop: 3 }}>{l}</div>)}
    </div>
  )
}
