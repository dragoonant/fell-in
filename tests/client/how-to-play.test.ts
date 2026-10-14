// "How to play" guide: content shape, ruler table sourced from data, and a static render of the overlay.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import rulersData from '../../data/1e/rulers.json'
import { ACTIONS, GUIDE, RULER_HEX, RULER_ROWS, SKILL_FACES } from '../../src/client/ui/howToPlayContent'
import { HowToPlay, HowToPlayBody, HowToPlayDialog, useHowToPlay } from '../../src/client/ui/HowToPlay'

const allText = (): string => [
  ...GUIDE.flatMap((s) => [s.title, s.intro ?? '', ...(s.bullets ?? [])]),
  ...ACTIONS.flatMap((a) => [a.name, a.cost, a.text]),
].join(' ')

describe('how to play guide', () => {
  it('HTP-001 covers round, activation, actions, reactions, dice, rulers, ending and odds with unique ids', () => {
    const ids = GUIDE.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ['round', 'activation', 'actions', 'reactions', 'dice', 'rulers', 'ending', 'odds']) expect(ids).toContain(id)
    for (const s of GUIDE) expect((s.intro ?? '').length + (s.bullets?.length ?? 0) + (s.actions ? 1 : 0)).toBeGreaterThan(0)
  })
  it('HTP-002 lists the main actions, each with a cost and one short line', () => {
    const names = ACTIONS.map((a) => a.name)
    for (const n of ['Move', 'Shoot', 'Throw', 'Charge', 'Close Combat', 'Prepare', 'Use Expertise', 'Quick Action']) expect(names).toContain(n)
    for (const a of ACTIONS) {
      expect(a.cost.length).toBeGreaterThan(0)
      expect(a.text.length).toBeLessThan(200)
    }
  })
  it('HTP-003 ruler rows come straight from data/1e/rulers.json and every colour has a swatch', () => {
    expect(RULER_ROWS).toEqual(rulersData.rulers.map((r) => ({ colour: r.colour, inches: r.inches })))
    for (const r of RULER_ROWS) expect(RULER_HEX[r.colour]).toMatch(/^#[0-9a-f]{6}$/i)
  })
  it('HTP-004 skill die diagram groups cover all 20 faces', () => {
    expect(SKILL_FACES.reduce((n, f) => n + f.faces, 0)).toBe(20)
  })
  it('HTP-005 states the core turn rules: one Ready per turn, use all or none, two Actions', () => {
    const t = allText()
    expect(t).toContain('exactly one')
    expect(t).toMatch(/use all of your Ready models/i)
    expect(t).toMatch(/two Actions/)
  })
  it('HTP-006 no publisher names or "compatible" wording in the guide text', () => {
    expect(allText()).not.toMatch(/modiphius|bethesda|zenimax|compatible/i)
  })
  it('HTP-007 renders every section and the ruler lengths; the overlay renders only when open', () => {
    const body = renderToStaticMarkup(createElement(HowToPlayBody))
    for (const s of GUIDE) expect(body).toContain(`data-testid="how-to-play-${s.id}"`)
    for (const r of RULER_ROWS) expect(body).toContain(`${r.inches} in`)
    expect(renderToStaticMarkup(createElement(HowToPlay))).toBe('')
    expect(renderToStaticMarkup(createElement(HowToPlayDialog, { onClose: () => {} }))).toContain('data-testid="how-to-play-close"')
    useHowToPlay.getState().setOpen(true)
    expect(useHowToPlay.getState().open).toBe(true)
    useHowToPlay.getState().setOpen(false)
  })
})
