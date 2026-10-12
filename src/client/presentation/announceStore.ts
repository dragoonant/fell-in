// Banners (round, turn, game over) and the narration log. Written by the director as beats start; read by the HUD.
import { create } from 'zustand'
import type { BannerTone } from './cues'

export interface Banner { id: number; text: string; tone: BannerTone; startedAt: number; durationMs: number }
export interface NarrationLine { seq: number; text: string }

export const NARRATION_LIMIT = 200

interface AnnounceState { banner: Banner | null; lines: NarrationLine[] }

export const useAnnounceStore = create<AnnounceState>(() => ({ banner: null, lines: [] }))

let bannerSeq = 0
export function showBanner(text: string, tone: BannerTone, startedAt: number, durationMs: number): void {
  useAnnounceStore.setState({ banner: { id: ++bannerSeq, text, tone, startedAt, durationMs } })
}
export function clearBanner(): void {
  if (useAnnounceStore.getState().banner) useAnnounceStore.setState({ banner: null })
}
export function addNarration(lines: NarrationLine[]): void {
  if (lines.length) useAnnounceStore.setState((s) => ({ lines: [...s.lines, ...lines].slice(-NARRATION_LIMIT) }))
}
export function resetAnnouncements(): void {
  useAnnounceStore.setState({ banner: null, lines: [] })
}
