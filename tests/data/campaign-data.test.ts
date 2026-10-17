// Campaign data tests (M6): the data/1e/campaign records against spec 19 / spec 20, plus validator negatives.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { campaignIndex, campaignRecords, boostsForRack, splitCampaign, withCampaign, awardFor } from '../../src/data/campaign'
import { campaignStatsOf, codesIn, validateCampaign } from '../../src/data/campaign-validate'
import { CAMPAIGN_KINDS, type CampaignFiles } from '../../src/data/campaign-types'
import { emptyBundle, type RawFile } from '../../src/data/bundle'
import { formatError } from '../../src/data/validate'
import { validateDataDir } from '../../tools/validate-data'
import { campaign, campaignBundle, campaignLookup } from '../../src/data/campaign-loader'
import { campaignData } from '../../src/campaign/data'

const DIR = resolve(__dirname, '..', '..', 'data', '1e', 'campaign')
const raw: RawFile[] = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => ({ path: `1e/campaign/${f}`, json: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }))
const files: CampaignFiles = splitCampaign(raw).byEdition['1e']
const rec = campaignRecords(files)
const idx = campaignIndex(rec)
const scenarioIds = new Set<string>(JSON.parse(readFileSync(resolve(DIR, '..', 'scenarios', 'scenarios.json'), 'utf8')).map((s: { id: string }) => s.id))
const clone = (): CampaignFiles => JSON.parse(JSON.stringify(files))
const messages = (f: CampaignFiles) => validateCampaign('1e', f, scenarioIds).map(formatError)

describe('campaign data', () => {
  it('CAMP-D01 all eight files exist and the whole data tree validates with no campaign problem', () => {
    expect(CAMPAIGN_KINDS.filter((k) => files[k] === undefined)).toEqual([])
    expect(validateDataDir().filter((e) => e.file.includes('campaign')).map(formatError)).toEqual([])
    expect(messages(files)).toEqual([])
  })

  it('CAMP-001 a new settlement starts with 2 Generator - Small, 1 Stores, 1 Maintenance Shed, 1 Listening Post', () => {
    const starting = Object.fromEntries(rec.structures.filter((s) => s.starting).map((s) => [s.id, s.starting]))
    expect(starting).toEqual({ 'generator-small': 2, stores: 1, 'maintenance-shed': 1, 'listening-post': 1 })
    expect(idx.require('structures', 'generator-small').provides).toEqual({ power: 3 })
    expect(idx.require('structures', 'land').provides?.slots).toBe(10)
  })

  it('CAMP-013 Land is 500 caps or 5 Quests for 10 slots and is neither powered nor limited', () => {
    const land = idx.require('structures', 'land')
    expect([land.cost, land.questsAlt, land.power, land.max]).toEqual([500, 5, 0, undefined])
  })

  it('SETT-007 Power and Water: generators and boost racks need none, Crop Field needs 1 Water, others default to 1', () => {
    const power = (id: string) => idx.require('structures', id).power
    expect([power('generator-large'), power('water-pump'), power('boston-bugle-small'), power('crop-field')]).toEqual([0, 0, 0, 0])
    expect(idx.require('structures', 'crop-field').water).toBe(1)
    expect(idx.require('structures', 'crop-field').max).toBe(5)
    expect(power('stores')).toBeUndefined()
    expect(rec.structures.filter((s) => s.group === 'boost').every((s) => s.power === 0)).toBe(true)
  })

  it('the Structure catalogue matches the CH p21-23 price tables (63 entries, shops 1/2/3 keep 1)', () => {
    expect(rec.structures).toHaveLength(63)
    const price = (ids: string[]) => ids.map((i) => idx.require('structures', i).cost)
    expect(price(['scavenging-stand', 'scavenging-stall', 'scavenging-stores'])).toEqual([50, 100, 150])
    expect(price(['weapons-stand', 'weapons-shop', 'weapons-emporium'])).toEqual([100, 150, 200])
    expect(price(['drink-stand', 'bar', 'restaurant'])).toEqual([100, 150, 200])
    expect(price(['boston-bugle-small', 'boston-bugle-medium', 'boston-bugle-large'])).toEqual([35, 55, 75])
    expect(price(['grognak-the-barbarian-small', 'astoundingly-awesome-tales-large'])).toEqual([50, 100])
    expect(price(['stores', 'maintenance-shed', 'lockers', 'brahmin-pen', 'brahmin-troughs', 'brahmin-ranch', 'operations-room', 'leaders-office', 'robot-market', 'creature-market'])).toEqual([150, 60, 70, 300, 200, 250, 400, 500, 250, 250])
    expect(price(['ranger-outpost', 'scout-camp', 'listening-post'])).toEqual([100, 200, 0])
    const shop = idx.require('structures', 'armor-emporium').effect
    expect(shop).toEqual({ op: 'draw', deck: 'item', itemClass: 'armor', draw: 3, keep: 1 })
    for (const s of rec.structures) if (s.effect && 'op' in s.effect && s.effect.op === 'draw') expect(s.effect.draw).toBeGreaterThanOrEqual(s.effect.keep)
  })

  it('PERK-007 / PERK-008 the starter Perks cost 3, 3, 3, 3, 5, 6, 4 and Gun Nut, Blacksmith and Armorer grant a free workbench', () => {
    const cost = (id: string) => idx.require('perks', id).cost
    expect(['gun-nut-rifle', 'gun-nut-pistol', 'blacksmith', 'armorer', 'local-leader', 'nerd-rage', 'mysterious-stranger'].map(cost)).toEqual([3, 3, 3, 3, 5, 6, 4])
    expect(rec.perks.filter((p) => p.deck === '2p-starter').map((p) => p.id)).toContain('mysterious-stranger')
    expect(idx.require('perks', 'blacksmith').grants).toEqual([{ structure: 'weapons-workbench' }])
    expect(idx.require('perks', 'armorer').grants).toEqual([{ structure: 'armor-workbench' }])
    expect(idx.require('perks', 'local-leader-ii').requires).toEqual({ perks: ['local-leader'] })
    expect(idx.require('perks', 'mysterious-stranger-ii').requires?.perks).toEqual(['mysterious-stranger'])
    for (const id of ['gun-nut-heavy', 'robotics-expert', 'creature-trainer']) expect(idx.require('perks', id).settlementWide).toBe(true)
    // every Structure that needs a Perk points at a real one, and the Weapons Workbench accepts the whole Gun Nut family
    expect(idx.require('structures', 'weapons-workbench').requires?.perks).toEqual(['blacksmith', 'gun-nut-rifle', 'gun-nut-pistol', 'gun-nut-heavy'])
  })

  it('BOOST-004 / typed racks: Second Chance is named, Use Your Body is Cunning, unknown types fill any typed rack', () => {
    expect(idx.require('boosts', 'use-your-body').type).toBe('cunning')
    expect(idx.require('boosts', 'second-chance').timing).toBe('skillTest')
    expect(rec.boosts.filter((b) => b.type === null).every((b) => b.typeUnknown === true)).toBe(true)
    expect(boostsForRack(rec.boosts, 'practiced').length).toBe(rec.boosts.length - 1)
    expect(boostsForRack(rec.boosts, 'cunning')).toHaveLength(rec.boosts.length)
    expect(boostsForRack(rec.boosts)).toHaveLength(rec.boosts.length)
    expect(rec.boosts).toHaveLength(38)
  })

  it('EVENT-008 / EXPL-006 / EXPL-007 Dust Cloud flips, Lightning Storm lingers, Gun for Hire leaves a Consequence, Hand-Written Note is not an Explore card', () => {
    expect([idx.require('events', 'dust-cloud').flip, idx.require('events', 'unbearable-heat').flip]).toEqual([true, false])
    expect(idx.require('events', 'lightning-storm').persists).toBe(true)
    const gfh = idx.require('explore', 'gun-for-hire')
    expect(gfh.outcomes).toEqual([{ when: 'pay', payCaps: 30, consequence: 'gun-for-hire-consequence' }])
    expect(idx.require('events', 'gun-for-hire-consequence')).toMatchObject({ consequence: true, owner: 'player' })
    expect(rec.explore.some((e) => e.id === 'hand-written-note-draw')).toBe(false) // an Item draw, never an Explore Deck card (ERR p.14)
    expect(rec.explore).toHaveLength(36)
  })

  it('QUEST-002 multi-part Quests chain to parts that share their title', () => {
    expect(idx.require('quests', 'the-thiefs-trail-part-1').next).toEqual(['the-thiefs-trail-part-2a', 'the-thiefs-trail-part-2b'])
    expect(idx.require('quests', 'revenge-part-2').next).toEqual(['revenge-part-3'])
    expect(idx.require('quests', 'handy-delivery-part-2').title).toBe('Handy Delivery')
    expect(rec.quests).toHaveLength(18)
  })

  it('CAMP-003 / CAMP-004 / CAMP-005 caps: default 200 / 120, draw pays 200, +50 at 1,000; scenario records override', () => {
    const { own, default: def } = awardFor(rec['caps-awards'], undefined)
    expect(own).toBeUndefined()
    expect(def).toMatchObject({ winner: 200, loser: 120, draw: 'winner', bigForceBonus: { from: 1000, each: 50 } })
    expect(awardFor(rec['caps-awards'], 'suit-up').own).toMatchObject({ byLevel: { major: 200, minor: 100 }, bySide: { attacker: { win: 200 } } })
    expect(awardFor(rec['caps-awards'], 'police-station-defense').own?.winner).toBe(150)
    expect(awardFor(rec['caps-awards'], 'ai-rr').own?.byLevel).toEqual({ major: 150, minor: 70 })
    expect(rec.injuries).toEqual([])
  })

  it('every hook a record uses is named in its file, every placeholder is a card-text gap, and counts are stable', () => {
    for (const k of CAMPAIGN_KINDS) {
      const f = files[k] as { hooks: Record<string, string>; records: unknown[] }
      const used = new Set(codesIn(f.records))
      expect([...used].filter((c) => !(c in f.hooks))).toEqual([])
      expect(Object.keys(f.hooks).filter((c) => !used.has(c))).toEqual([])
    }
    const st = campaignStatsOf(files)
    expect(st.placeholders.structures + st.placeholders.perks + st.placeholders['caps-awards']).toBe(0)
    expect(st.placeholders).toMatchObject({ boosts: 34, events: 7, quests: 18, explore: 35 })
  })

  it('withCampaign fills records.perks and records.campaign without touching the input bundle', () => {
    const b = emptyBundle('1e')
    const out = withCampaign(b, files)
    expect(b.records.perks).toEqual([])
    expect(out.records.perks).toHaveLength(rec.perks.length)
    expect(out.records.campaign.structures).toHaveLength(63)
  })
})

describe('campaign loader', () => {
  it('the Vite loader serves the same records and feeds src/campaign/data.ts campaignData', () => {
    expect(campaign().structures).toHaveLength(rec.structures.length)
    expect(campaignLookup().require('perks', 'nerd-rage').cost).toBe(6)
    const d = campaignData(campaignBundle())
    expect(d.perks).toHaveLength(rec.perks.length)
    expect(d.structures).toHaveLength(63)
    expect(d.awards.find((a) => a.id === 'default')?.winner).toBe(200)
  })
})

describe('campaign validator', () => {
  it('rejects duplicate ids, a bad cost, an unnamed hook and a missing source', () => {
    const f = clone() as Record<string, { records: Record<string, unknown>[]; hooks: Record<string, string> }>
    f.structures.records.push({ ...f.structures.records[0] })
    f.structures.records[1].cost = 'free'
    ;(f.structures.records[2] as { effect: unknown }).effect = { code: 'mystery' }
    delete f.structures.records[3].source
    const m = messages(f as unknown as CampaignFiles).join('\n')
    expect(m).toContain('duplicate id')
    expect(m).toContain('cost: must be a number >= 0')
    expect(m).toContain('hook "mystery" is not named')
    expect(m).toContain('source: is required')
  })

  it('rejects unresolved references and a follow-on part with another title', () => {
    const f = clone() as Record<string, { records: Record<string, unknown>[] }>
    ;(f.structures.records.find((r) => r.id === 'brahmin-ranch') as { requires: unknown }).requires = { perks: ['no-such-perk'] }
    ;(f.perks.records.find((r) => r.id === 'blacksmith') as { grants: unknown }).grants = [{ structure: 'no-such-structure' }]
    ;(f.quests.records.find((r) => r.id === 'revenge-part-1') as { next: unknown }).next = ['bounty']
    const m = messages(f as unknown as CampaignFiles).join('\n')
    expect(m).toContain('unknown perk id "no-such-perk"')
    expect(m).toContain('unknown structure id')
    expect(m).toContain('must share the title')
  })

  it('allows the placeholder source only on boosts, events, quests and explore, and keeps a Boost type honest', () => {
    const f = clone() as Record<string, { records: Record<string, unknown>[] }>
    f.structures.records[0].source = ['placeholder', 'CH p21']
    f.perks.records[0].source = 'placeholder'
    f.boosts.records[1].type = 'sneaky'
    f.boosts.records[2].typeUnknown = false
    const m = messages(f as unknown as CampaignFiles).join('\n')
    expect(m.match(/"placeholder" is only allowed/g)?.length).toBe(2)
    expect(m).toContain('type: must be one of practiced|cunning|tactical|instinctive')
    expect(m).toContain('type: null needs typeUnknown: true')
  })

  it('needs exactly one default caps award and checks scenario ids', () => {
    const f = clone() as Record<string, { records: Record<string, unknown>[] }>
    f['caps-awards'].records = f['caps-awards'].records.filter((r) => r.id !== 'default')
    ;(f['caps-awards'].records.find((r) => r.id === 'box-1') as { scenarioId: string }).scenarioId = 'box-99'
    ;(f['caps-awards'].records.find((r) => r.id === 'suit-up') as { scenarioPending?: boolean }).scenarioPending = undefined
    const m = messages(f as unknown as CampaignFiles).join('\n')
    expect(m).toContain('exactly one default record')
    expect(m).toContain('unknown scenario "box-99"')
    expect(m).toContain('unknown scenario "suit-up"')
  })

  it('splitCampaign reports a file it does not know and leaves the main loader folders alone', () => {
    const out = splitCampaign([{ path: '1e/campaign/mystery.json', json: {} }, { path: '1e/units/other.json', json: [] }, { path: '1e/campaign/boosts.json', json: { kind: 'boosts' } }])
    expect(out.problems.map((p) => p.message).join()).toContain('unknown campaign file "mystery"')
    expect(Object.keys(out.byEdition['1e'])).toEqual(['boosts'])
  })
})
