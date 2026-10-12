// Client core (M3): game store, presentation director, bot driver, saves, params.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { readParams } from '../../src/client/params'
import { buildBeats, parsePurpose } from '../../src/client/presentation/beats'
import { enqueueBatch, setDirectorClock, setPaused, skipAll } from '../../src/client/presentation/director'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'
import {
  dispatch, exportSave, importSave, isBotDecision, isHumanDecision, legalFor, newGame, resetGameStore, useGameStore,
} from '../../src/client/store/gameStore'
import { useSettingsStore } from '../../src/client/store/settingsStore'
import type { Action, GameState } from '../../src/engine/types'

const fp = (s: GameState | null) => JSON.stringify(s)
const first = (): Action => legalFor(useGameStore.getState().state).find((a) => a.type !== 'move.to')!

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 1))
  }
}

beforeEach(() => { useSettingsStore.getState().set({ speed: 0 }, false); setPaused(false); setDirectorClock(null); resetGameStore() })
afterEach(() => { setPaused(false); setDirectorClock(null) })

describe('client core', () => {
  it('CLIENT-001 newGame seats controllers in order and presents the starting state', () => {
    expect(newGame({ seed: 'c1', seats: ['human', 'bot'] })).toBeNull()
    const g = useGameStore.getState()
    expect(g.seatOrder).toEqual(['A', 'B'])
    expect(g.controllers).toEqual({ A: 'human', B: 'bot' })
    expect(usePresentedStore.getState().state).toBe(g.state)
    expect(legalFor(g.state).length).toBeGreaterThan(0)
  })

  it('CLIENT-002 a human cannot answer a bot decision; the owning human can', () => {
    newGame({ seed: 'c2', seats: ['bot', 'human'] })
    expect(isBotDecision()).toBe(true)
    const r = dispatch(first(), 'human')
    expect(r?.code).toBe('E_CLIENT')
    expect(useGameStore.getState().state!.log.length).toBe(0)
    newGame({ seed: 'c2', seats: ['human', 'human'] })
    expect(isHumanDecision()).toBe(true)
    expect(dispatch(first(), 'human')).toBeNull()
    expect(useGameStore.getState().state!.log.length).toBe(1)
  })

  it('CLIENT-003 an engine rejection is reported in our words and leaves the state alone', () => {
    newGame({ seed: 'c3', seats: ['human', 'human'] })
    const before = useGameStore.getState().state
    const r = dispatch({ ...first(), decisionId: 'd:999' }, 'human')
    expect(r?.code).toBe('E_STALE_DECISION')
    expect(r?.text).toMatch(/earlier question/)
    expect(useGameStore.getState().state).toBe(before)
  })

  it('CLIENT-004 the director holds the presented state until beats play, and skipAll catches up', () => {
    let now = 0
    const timers: { at: number; fn: () => void }[] = []
    setDirectorClock({ now: () => now, setTimeout: (fn, ms) => { const t = { at: now + ms, fn }; timers.push(t); return t }, clearTimeout: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1) } })
    newGame({ seed: 'c4', seats: ['human', 'human'] })
    useSettingsStore.getState().set({ speed: 1 }, false)
    for (let guard = 0; usePresentedStore.getState().idle && guard < 50; guard++) dispatch(first(), 'human')
    expect(usePresentedStore.getState().idle).toBe(false)
    expect(usePresentedStore.getState().state).not.toBe(useGameStore.getState().state)
    expect(isHumanDecision()).toBe(true)
    skipAll()
    expect(usePresentedStore.getState().idle).toBe(true)
    expect(usePresentedStore.getState().state).toBe(useGameStore.getState().state)
    void timers
  })

  it('CLIENT-005 dice events group into one dice cue per test', () => {
    expect(parsePurpose('shoot:skill')).toMatchObject({ base: 'shoot', role: 'skill', reroll: false })
    expect(parsePurpose('shoot:reroll:green')).toMatchObject({ base: 'shoot', role: 'effect', colour: 'green', reroll: true })
    expect(parsePurpose('advantage')).toMatchObject({ base: 'advantage', role: 'other' })
    newGame({ seed: 'c5', seats: ['human', 'human'] })
    const s = useGameStore.getState().state!
    const ev = (purpose: string, d: number) => ({ type: 'DiceRolled' as const, rollId: purpose, purpose, ownerId: 'm1', sides: 20, dice: [d], total: d })
    const after = { ...s, events: [ev('shoot:skill', 12), ev('shoot:black', 3), ev('shoot:green', 5), { type: 'attack', attackerId: 'm1', targetId: 'm2', weaponId: 'w', ns: 'shoot', success: true, critical: false, sv: 9 }] }
    const beats = buildBeats(s, after, after.events.map((event, i) => ({ seq: i + 1, event })), null)
    expect(beats.map((b) => b.cue.kind)).toEqual(['dice', 'attack'])
    const dice = beats[0]!.cue
    expect(dice.kind === 'dice' && dice.dice.map((d) => d.role)).toEqual(['skill', 'effect', 'effect'])
  })

  it('CLIENT-006 bot vs bot: the driver plays decisions only while idle', async () => {
    newGame({ seed: 'c6', seats: ['bot', 'bot'] })
    const d = createBotDriver({ thinkMs: 0, budgetMs: 500 })
    d.start()
    try {
      await until(() => (useGameStore.getState().state?.log.length ?? 0) >= 25 || useGameStore.getState().state?.phase === 'over')
    } finally { d.stop() }
    expect(useGameStore.getState().fatal).toBeNull()
    expect(d.forced).toBe(0)
  })

  it('CLIENT-007 the watchdog force-answers a bot decision stuck behind the presentation', () => {
    let now = 0
    newGame({ seed: 'c7', seats: ['bot', 'bot'] })
    setPaused(true)
    enqueueBatch({ before: useGameStore.getState().state!, after: useGameStore.getState().state!, events: [], action: null })
    expect(usePresentedStore.getState().idle).toBe(false)
    const d = createBotDriver({ now: () => now, setTimeout: () => 0, clearTimeout: () => {}, watchdogMs: 5000 })
    expect(d.tick()).toBe('waiting')
    now = 5001
    expect(d.tick()).toBe('forced')
    expect(useGameStore.getState().state!.log.length).toBe(1)
  })

  it('CLIENT-008 a save replays to the same state', () => {
    newGame({ seed: 'c8', seats: ['human', 'human'] })
    for (let i = 0; i < 12 && useGameStore.getState().state!.phase !== 'over'; i++) dispatch(first(), 'human')
    const s = useGameStore.getState().state
    const save = exportSave()!
    resetGameStore()
    expect(importSave(JSON.parse(JSON.stringify(save)))).toBeNull()
    expect(fp(useGameStore.getState().state)).toBe(fp(s))
    expect(useGameStore.getState().controllers).toEqual({ A: 'human', B: 'human' })
  })

  it('CLIENT-009 params: seats, speed and autostart', () => {
    const p = readParams('?test=1&seats=bot,bot&seed=x&speed=fast&scenario=box-1')
    expect(p).toMatchObject({ test: true, seats: ['bot', 'bot'], seed: 'x', speed: 3, scenario: 'box-1', autostart: true })
    expect(readParams('').autostart).toBe(false)
    expect(readParams('?seats=human,human').seats).toEqual(['human', 'human'])
  })
})
