// Event feed grouping (pure). An attack cue opens a group; the dice, damage, removal and condition beats that follow
// it become its breakdown lines, until the next move, banner or attack.
import type { FeedEntry } from '../contract'

export interface FeedRow { id: number; text: string; tone: 'plain' | 'attack' | 'banner' | 'loss'; lines: string[] }
export interface FeedNamers { name: (id: string) => string; roll: (purpose: string) => string; data: (id: string) => string }

export function groupFeed(entries: readonly FeedEntry[], n: FeedNamers): FeedRow[] {
  const rows: FeedRow[] = []
  let open: FeedRow | null = null
  for (const e of entries) {
    const c = e.cue
    if (c.kind === 'banner') { rows.push({ id: e.id, text: e.text ?? c.text, tone: 'banner', lines: [] }); open = null; continue }
    if (c.kind === 'move') { rows.push({ id: e.id, text: e.text ?? `${n.name(c.modelId)} moves.`, tone: 'plain', lines: [] }); open = null; continue }
    if (c.kind === 'attack') {
      open = { id: e.id, text: e.text ?? 'An attack.', tone: 'attack', lines: [`${n.data(c.weaponId)} against SV ${c.sv}${c.critical ? ', Critical Attack' : ''}`] }
      rows.push(open)
      continue
    }
    const line = c.kind === 'dice'
      ? `${n.roll(c.purpose)}: ${c.dice.length} ${c.dice.length === 1 ? 'die' : 'dice'}${c.dice.some((d) => d.reroll) ? ' (with reroll)' : ''}`
      : e.text
    if (!line) continue
    if (open) { open.lines.push(line); if (c.kind === 'damage' && c.removed) open.tone = 'loss' }
    else rows.push({ id: e.id, text: line, tone: c.kind === 'removed' ? 'loss' : 'plain', lines: [] })
  }
  return rows
}
