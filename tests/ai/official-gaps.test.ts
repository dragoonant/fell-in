// Official AI gaps (AI-032..037): no re-contact after a declined follow, Luck Tough, AP card effects, Escaped Tech peek and Presence.
import { describe, expect, it } from 'vitest'
import { apEffect, createOfficialAiDecider } from '../../src/ai/official/decider'
import { canDoObjective } from '../../src/ai/official/objectives'
import { peekReach, presenceReach } from '../../src/ai/official/responses'
import type { EditionBundle } from '../../src/data/types'
import { legalActions as legalActionsOf } from '../../src/engine/pending'
import { createGame } from '../../src/engine/setup'
import type { Action, GameState, PendingDecision } from '../../src/engine/types'
import { view } from '../../src/engine/view'
import { activate, bundle, newDecider, parkAll, place, scene, set, step, stripLuck, testCard } from './official-helpers'

describe('declined follow-up (AI-032)', () => {
  const lay = () => scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [0, -3.5] } })

  it('AI-032 a Careful model that declined to follow a Push Back makes no base-contact attack on that enemy', () => {
    const { s, b } = lay()
    const card = testCard({ response: 'A', reckless: false, method: 'close' })
    const free = step(activate(s, b, 'ai-super-mutant-1'), newDecider(card))
    expect(free.action.type).toBe('charge.go')
    expect(free.action.targetId).toBe('p1-settler-1')
    const barred = set(s, 'ai-super-mutant-1', { tokens: { ...s.models['ai-super-mutant-1']!.tokens, 'noFollow:p1-settler-1': 1 } })
    const r = step(activate(barred, b, 'ai-super-mutant-1'), newDecider(card))
    expect(r.action.type).not.toBe('charge.go')
    expect(r.action.type).not.toBe('melee.attack')
    expect(r.log.target?.id).not.toBe('p1-settler-1')
  })

  it('AI-032 the bar is Careful only and names one enemy: Reckless still charges, and another enemy is still fair game', () => {
    const { s, b } = lay()
    const barred = set(s, 'ai-super-mutant-1', { tokens: { ...s.models['ai-super-mutant-1']!.tokens, 'noFollow:p1-settler-1': 1 } })
    const reckless = step(activate(barred, b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: true, method: 'close' })))
    expect(reckless.action.type).toBe('charge.go')
    const other = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [0, -3.5], 'p1-sole-survivor-1': [3, -3.5] } })
    const b2 = set(other.s, 'ai-super-mutant-1', { tokens: { ...other.s.models['ai-super-mutant-1']!.tokens, 'noFollow:p1-settler-1': 1 } })
    const r = step(activate(b2, other.b, 'ai-super-mutant-1'), newDecider(testCard({ response: 'A', reckless: false, method: 'close' })))
    expect(r.action.type).toBe('charge.go')
    expect(r.action.targetId).toBe('p1-sole-survivor-1')
  })
})

describe('Luck: Tough only (AI-033)', () => {
  const pend = (ask: string, targetId: string): { p: PendingDecision; legal: Action[] } => {
    const legal: Action[] = [{ type: 'shoot.luck', seat: 'ai', decisionId: 'd', ask, use: true }, { type: 'shoot.luck', seat: 'ai', decisionId: 'd', ask, use: false }]
    return { p: { id: `luck-${ask}`, seat: 'ai', kind: 'shoot.luck', context: { ask, targetId }, options: [], canPass: false }, legal }
  }
  const heroicGame = (): GameState => {
    const { s } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [0, 3] } })
    return set(s, 'ai-super-mutant-1', { heroic: true, luck: 1 })
  }

  it('AI-033 a Heroic AI model with a Luck token uses it for Tough and keeps it for Accurate, Dodge and Critical', () => {
    const s = heroicGame()
    const d = newDecider(testCard({ response: 'A' }))
    const tough = pend('tough', 'ai-super-mutant-1')
    expect(d.decideSync(view(s, 'ai'), tough.p, tough.legal).action.use).toBe(true)
    for (const ask of ['accurate', 'dodge', 'crit']) {
      const x = pend(ask, 'ai-super-mutant-1')
      expect(d.decideSync(view(s, 'ai'), x.p, x.legal).action.use).toBe(false)
    }
  })

  it('AI-033 a non-Heroic AI model, or one with no Luck token, declines Tough', () => {
    const d = newDecider(testCard({ response: 'A' }))
    const x = pend('tough', 'ai-super-mutant-1')
    const plain = set(heroicGame(), 'ai-super-mutant-1', { heroic: false })
    expect(d.decideSync(view(plain, 'ai'), x.p, x.legal).action.use).toBe(false)
    const none = set(heroicGame(), 'ai-super-mutant-1', { luck: 0 })
    expect(d.decideSync(view(none, 'ai'), x.p, x.legal).action.use).toBe(false)
  })
})

describe('AP on card effects (AI-034)', () => {
  const spend = (effect: string): Action => ({ type: 'ap.spend', seat: 'ai', decisionId: 'd', effect })
  const card = (notes: string[]) => testCard({ response: 'A', notes })
  const me = (damage: number, rad: number) => set(scene({}).s, 'ai-super-mutant-1', { damage, rad }).models['ai-super-mutant-1']!

  it('AI-034 only effects the card shows are spent, regular damage before radiation, and only when there is something to remove', () => {
    const legal = [spend('removeRad'), spend('removeDamage')]
    expect(apEffect(card(['ap:removeDamage', 'ap:removeRad']), me(2, 1), legal)?.effect).toBe('removeDamage')
    expect(apEffect(card(['ap:removeDamage', 'ap:removeRad']), me(0, 1), legal)?.effect).toBe('removeRad')
    expect(apEffect(card(['ap:removeRad']), me(2, 0), legal)).toBeNull()
    expect(apEffect(card([]), me(2, 1), legal)).toBeNull()
    expect(apEffect(card(['ap:removeDamage']), me(2, 1), [])).toBeNull()
  })

  it('AI-034 after both Actions the decider spends an offered AP on the card effect instead of ending', () => {
    const { s: s0, b } = scene({ place: { 'ai-super-mutant-1': [0, -8], 'p1-settler-1': [10, 10] } })
    const s = set(activate(s0, b, 'ai-super-mutant-1', 2, { ap: 1 }), 'ai-super-mutant-1', { damage: 2 })
    const legal: Action[] = [spend('removeDamage'), { type: 'turn.end', seat: 'ai', decisionId: 'd' }]
    const pending: PendingDecision = { ...s.pending, context: { modelId: 'ai-super-mutant-1', actionsLeft: 0, ap: 1 } }
    const d = newDecider(card(['ap:removeDamage']))
    const r = d.decideSync(view(s, 'ai'), pending, legal)
    expect(r.action.type).toBe('ap.spend')
    expect(r.log.activity).toBe('ap.removeDamage')
    const none = newDecider(card([])).decideSync(view(s, 'ai'), pending, legal)
    expect(none.action.type).toBe('turn.end')
  })
})

// ---- The Escaped Tech (AIH s4 p7) ----
const techBundle = (ai: { objective: 'use'; subject: string }): EditionBundle => ({
  ...bundle,
  records: { ...bundle.records, scenarios: bundle.records.scenarios.map((sc) => (sc.id === 'ai-tech' ? { ...sc, sides: sc.sides.map((sd) => (sd.ai ? { ...sd, ai } : sd)) } : sc)) },
})
/** ai-tech with every AI model sent to a far corner, only marker-8 left, and the hound / Super Mutant under test placed. */
function techScene(b: EditionBundle, onlyMarker: boolean, at: Record<string, [number, number]>): GameState {
  let s = stripLuck(parkAll(createGame(b, { seed: 'tech', scenarioId: 'ai-tech', seats: ['p1', 'ai'] })))
  if (onlyMarker) s = { ...s, markers: s.markers.filter((m) => m.id === 'marker-8') }
  for (const m of Object.values(s.models)) if (m.owner === 'ai') s = place(s, m.id, 17, 17)
  for (const [id, [x, z]] of Object.entries(at)) s = place(s, id, x, z)
  return s
}

describe('The Escaped Tech: peek and Presence (AI-035, AI-036)', () => {
  it('AI-035 a hound walks to within its capped Awareness (Red) of the nearest marker, not into contact, then peeks', () => {
    const s = techScene(bundle, true, { 'ai-mutant-hound-1': [14, -11.6] })
    const d = newDecider(testCard({ response: 'O', unitId: 'mutant-hound' }))
    const first = step(activate(s, bundle, 'ai-mutant-hound-1'), d)
    expect(first.log.activity).toBe('use.peekApproach')
    const moved = step(first.state, d)
    const h = moved.state.models['ai-mutant-hound-1']!
    const gap = Math.hypot(h.pos.x - 0.6, h.pos.z + 11.6) - 32 / 25.4 / 2
    const reach = peekReach(view(s, 'ai') as never, bundle, h)
    expect(reach).toBe(6) // Red; the hound's own Awareness is longer, the wind caps it
    expect(gap).toBeLessThanOrEqual(reach)
    expect(gap).toBeGreaterThan(1) // not into base contact
    const look = step(moved.state, d)
    expect(look.action.type).toBe('search.peek')
    expect(look.log.activity).toBe('use.interact')
  })

  const tb = techBundle({ objective: 'use', subject: 'enslaved-tech' })
  const withTech = (sm: [number, number], tech: [number, number]): GameState => {
    const s = techScene(tb, false, { 'ai-super-mutant-1': sm, 'p1-settler-1': tech })
    return set(s, 'p1-settler-1', { profileId: 'enslaved-tech' })
  }

  it('AI-036 a Super Mutant Using Presence on the Tech moves into its Presence ruler with line of sight, then holds', () => {
    const d = newDecider(testCard({ response: 'O', reckless: true }), tb)
    const s = withTech([0, 0], [7.5, 0])
    const sm = s.models['ai-super-mutant-1']!
    const reach = presenceReach(tb, sm)!
    expect(reach).toBe(4)
    const first = step(activate(s, tb, 'ai-super-mutant-1'), d, tb)
    expect(first.log.activity).toBe('use.presenceApproach')
    const moved = step(first.state, d, tb)
    const m = moved.state.models['ai-super-mutant-1']!
    expect(Math.hypot(7.5 - m.pos.x, m.pos.z) - 40 / 25.4 / 2 - 32 / 25.4 / 2).toBeLessThanOrEqual(reach)
    const hold = step(moved.state, d, tb)
    expect(hold.log.activity).toBe('use.presenceHold')
    expect(hold.action.type).toBe('turn.end')
  })

  it('AI-036 when the engine offers the Presence Use on the Tech it is taken first; a model without Presence cannot Use it', () => {
    const s = activate(withTech([0, 0], [3, 0]), tb, 'ai-super-mutant-1')
    const use: Action = { type: 'expertise.use', seat: 'ai', decisionId: 'd', modelId: 'ai-super-mutant-1', targetId: 'p1-settler-1' }
    const legal = [...legalActionsOf(s), use]
    const r = newDecider(testCard({ response: 'O', reckless: true }), tb).decideSync(view(s, 'ai'), s.pending, legal)
    expect(r.action.type).toBe('expertise.use')
    expect(r.log.chain).toEqual(['O', 'use'])
    // The Use is impossible for a model with no Presence skill: O falls back to A (CH p13).
    const noSkill = set(s, 'ai-super-mutant-1', { profileId: 'machine-gun-turret-mk1' })
    const subject = { kind: 'model' as const, ids: ['p1-settler-1'], points: [{ x: 3, z: 0 }] }
    const settings = { objective: 'use' as const, subject: 'enslaved-tech' }
    expect(canDoObjective(view(s, 'ai') as never, tb, s.models['ai-super-mutant-1']!, settings, subject)).toBe(true)
    expect(canDoObjective(view(noSkill, 'ai') as never, tb, noSkill.models['ai-super-mutant-1']!, settings, subject)).toBe(false)
  })
})

describe('declined free offers (AI-037)', () => {
  it('AI-037 the AI stays put on the Battle Cry escape and takes no free Quick Action when dying, whatever the option order', () => {
    const { s } = scene({})
    const d = createOfficialAiDecider({ seed: 'r', bundle })
    const esc = { id: 'd:60', seat: 'ai', kind: 'battleCry.escape', context: { modelId: 'ai-brute-1' }, canPass: false, options: [] }
    const escLegal: Action[] = [
      { type: 'battleCry.escape', decisionId: 'd:60', seat: 'ai', modelId: 'ai-brute-1', go: true },
      { type: 'battleCry.escape', decisionId: 'd:60', seat: 'ai', modelId: 'ai-brute-1', go: false },
    ]
    const r1 = d.decideSync(view(s, 'ai'), esc as unknown as PendingDecision, escLegal)
    expect(r1.action.go).toBe(false)
    expect(r1.log.activity).toBe('battleCry.escape.stay')
    const dying = { id: 'd:61', seat: 'ai', kind: 'damage.dying', context: { modelId: 'ai-brute-1' }, canPass: false, options: [] }
    const dyLegal: Action[] = [
      { type: 'damage.dying', decisionId: 'd:61', seat: 'ai', modelId: 'ai-brute-1', take: true, inner: { type: 'move.go' } },
      { type: 'damage.dying', decisionId: 'd:61', seat: 'ai', modelId: 'ai-brute-1', take: false },
    ]
    const r2 = d.decideSync(view(s, 'ai'), dying as unknown as PendingDecision, dyLegal)
    expect(r2.action.take).toBe(false)
    expect(r2.log.activity).toBe('damage.dying.decline')
  })
})
