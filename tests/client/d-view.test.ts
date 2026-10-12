// Dice tray and start screen pure view helpers (owner D).
import { describe, expect, it } from 'vitest'
import { outcomeAfter, viewRoll, type FaceLookup } from '../../src/client/dice/diceView'
import { buildOptions, cleanSeed, groupScenarios, pickDefaultScenario, seatsFor } from '../../src/client/ui/start/startView'
import type { ScenarioChoice } from '../../src/client/store/launch'
import type { RolledDie } from '../../src/client/contract'

const lookup: FaceLookup = {
  skill: (f) => (f === 3 ? { value: 1, icons: ['CP'] } : f === 7 ? { value: 3, icons: [] } : null),
  effect: (_c, f) => (f === 12 ? ['ACC1'] : f === 1 ? ['DMG'] : []),
}
const die = (p: Partial<RolledDie>): RolledDie => ({ role: 'effect', sides: 12, face: 1, reroll: false, rollId: 'r:1', ...p })

describe('dice view', () => {
  it('marks crit faces, drops a superseded die from accuracy and flags the re-roll', () => {
    const cue = { kind: 'dice' as const, purpose: 'shoot', rolls: [], dice: [
      die({ role: 'skill', sides: 20, face: 3 }), die({ colour: 'green', face: 12 }), die({ colour: 'green', face: 1, reroll: true, rollId: 'r:2' }),
    ] }
    const v = viewRoll(cue, lookup, { success: true, critical: true, sv: 6 }, 'Ranged attack')
    expect(v.dice[0]!.crit).toBe(true)
    expect(v.dice[1]!.superseded).toBe(true)
    expect(v.acc).toBe(0)
    expect(v.rerolled).toBe(true)
    expect(v.verdict).toEqual({ word: 'Critical hit', tone: 'crit' })
  })
  it('reads a luck flip and ignores any attack outcome for it', () => {
    const cue = { kind: 'dice' as const, purpose: 'luck', rolls: [], dice: [die({ role: 'other', sides: 2, face: 2 })] }
    const v = viewRoll(cue, lookup, { success: true, critical: false, sv: 5 }, 'Luck')
    expect(v.luck).toBe('blank')
    expect(v.outcome).toBeNull()
    expect(v.dice[0]!.text).toBe('Blank')
  })
  it('finds the attack result after a dice cue but stops at the next dice cue', () => {
    const a = { kind: 'dice' }, b = { kind: 'dice' }, atk = { kind: 'attack', success: false, critical: false, sv: 4 }
    expect(outcomeAfter([{ cue: a }, { cue: atk }], a)).toEqual({ success: false, critical: false, sv: 4 })
    expect(outcomeAfter([{ cue: a }, { cue: b }, { cue: atk }], a)).toBeNull()
  })
})

describe('start view', () => {
  const sc = (id: string, mode: string, sides = 2): ScenarioChoice => ({ id, name: id, mode, rounds: 6, sides })
  const list = [sc('ga-1', 'tutorial', 1), sc('box-2', 'versus'), sc('box-1', 'versus'), sc('coop-x', 'coop', 3)]
  it('groups with box scenarios first and numerically sorted, defaulting to box-1', () => {
    const g = groupScenarios(list)
    expect(g.map((x) => x.id)).toEqual(['box', 'tutorial', 'coop'])
    expect(g[0]!.items.map((s) => s.id)).toEqual(['box-1', 'box-2'])
    expect(pickDefaultScenario(list)).toBe('box-1')
    expect(pickDefaultScenario(list, 'nope')).toBe('box-1')
  })
  it('maps modes to seats padded to the side count and trims the seed', () => {
    expect(seatsFor('bot')).toEqual(['human', 'bot'])
    expect(seatsFor('hotseat')).toEqual(['human', 'human'])
    expect(seatsFor('watch', 3)).toEqual(['bot', 'bot', 'bot'])
    expect(cleanSeed('  ')).toBeUndefined()
    expect(buildOptions({ scenarioId: 'box-1', mode: 'bot', seed: ' abc ', sides: 2 })).toEqual({ scenarioId: 'box-1', seats: ['human', 'bot'], seed: 'abc' })
  })
})

describe('dice tray focus (M3 integration)', () => {
  it('steps over the armor roll to find the attack verdict and keeps the attack roll headlined', async () => {
    const { trayFocus } = await import('../../src/client/dice/diceView')
    const shot = { kind: 'dice', purpose: 'shoot:a>b' }, armor = { kind: 'dice', purpose: 'armor:physical' }
    const atk = { kind: 'attack', success: true, critical: false, sv: 4 }
    expect(outcomeAfter([{ cue: shot }, { cue: armor }, { cue: { kind: 'damage' } }, { cue: atk }], shot)).toEqual({ success: true, critical: false, sv: 4 })
    expect(outcomeAfter([{ cue: shot }, { cue: armor }, { cue: atk }], armor)).toBeNull()
    expect(trayFocus([{ cue: { purpose: 'advantage' } }, { cue: shot }, { cue: armor }])).toEqual({ main: 1, extra: 2 })
    expect(trayFocus([{ cue: armor }])).toEqual({ main: 0, extra: null })
  })
})
