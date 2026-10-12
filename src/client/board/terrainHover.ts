// Pointer hover over a terrain piece (set by the board, read by the tooltip). Screen coordinates, display only.
import { create } from 'zustand'

export interface TerrainHover { id: string | null; x: number; y: number }
export const useTerrainHover = create<TerrainHover>(() => ({ id: null, x: 0, y: 0 }))
export const hoverTerrain = (id: string, x: number, y: number): void => useTerrainHover.setState({ id, x, y })
export const clearTerrainHover = (id?: string): void => {
  const s = useTerrainHover.getState()
  if (s.id && (!id || s.id === id)) useTerrainHover.setState({ id: null })
}
