// The settlement's state: the open campaign, the step the player is looking at, and the last problem in plain words.
// Every change goes through the campaign layer's reducer (via adapter.ts) and is saved at once, so a closed tab loses nothing.
import { create } from 'zustand'
import { host } from './host'
import type { CampaignApi, CampaignDoc, CampaignView, NextBattle, StepView } from './model'

// The adapter pulls in the campaign rules and data; it loads on first use so the game screen never carries them.
const loadCampaignApi = (): Promise<CampaignApi> => import('./adapter').then((m) => m.loadCampaignApi())

interface SettlementState {
  api: CampaignApi | null
  campaign: CampaignDoc | null
  view: CampaignView | null
  steps: StepView[]
  /** Index of the step shown in the main panel. */
  cursor: number
  /** Plain-words problem (a missing campaign layer, a refused choice), or null. */
  error: string | null
  loading: boolean
}

export const useSettlement = create<SettlementState>(() => ({
  api: null, campaign: null, view: null, steps: [], cursor: 0, error: null, loading: true,
}))

const set = useSettlement.setState

/** The remembered scenario and opponent for the next battle (spec 20 "Campaign save shape"); cleared when a new campaign replaces the save. */
export const NEXT_KEY = 'fell-in.campaign.next'

/** First step the player still has to do (or the last step). */
export function firstOpenStep(steps: readonly StepView[]): number {
  const i = steps.findIndex((s) => s.state === 'current')
  if (i >= 0) return i
  const j = steps.findIndex((s) => s.state === 'later')
  return j >= 0 ? j : Math.max(0, steps.length - 1)
}

function show(api: CampaignApi, campaign: CampaignDoc, keepCursor = false): void {
  const steps = api.steps(campaign)
  const cursor = keepCursor ? Math.min(useSettlement.getState().cursor, Math.max(0, steps.length - 1)) : firstOpenStep(steps)
  set({ api, campaign, view: api.view(campaign), steps, cursor, error: null, loading: false })
  installTestApi()
}

const problem = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Open the settlement: the saved campaign (`continue`) or a fresh one (`new`, replacing the save). */
export async function openSettlement(mode: 'new' | 'continue', seed: string | null, faction: string | null = null): Promise<void> {
  set({ loading: true, error: null })
  try {
    const api = await loadCampaignApi()
    let c = mode === 'continue' ? api.load() : null
    // A save that exists but cannot be read (another version or edition) is never overwritten by "continue".
    if (!c && mode === 'continue' && host().hasCampaignSave()) throw new Error('The saved campaign was made by another version of the game and cannot be opened. Start a new campaign to replace it.')
    if (!c) {
      host().removeKey(NEXT_KEY)
      const fac = faction ?? (await host().loadCampaignFactions().catch(() => []))[0]?.id ?? null
      c = api.create({ seed: seed || Math.random().toString(36).slice(2, 10), faction: fac })
      api.save(c)
    }
    show(api, c)
  } catch (e) {
    set({ loading: false, error: problem(e) })
  }
}

/** Is there a saved campaign a new one would replace? (asks the layer; false when it cannot load) */
export async function savedCampaignExists(): Promise<boolean> {
  try { return (await loadCampaignApi()).load() !== null } catch { return false }
}

/** The step the campaign is on, by id (from the first player's record). */
function currentStepId(c: CampaignDoc | null): string | null {
  return c?.players[0]?.step ?? null
}

/** Run one campaign action (a choice button, a skip). Refusals show as a message and leave the campaign alone. */
export function act(action: unknown): boolean {
  const { api, campaign } = useSettlement.getState()
  if (!api || !campaign) return false
  try {
    const next = api.reduce(campaign, action)
    api.save(next)
    // When the layer moved on to another step, follow it; otherwise stay where the player is.
    show(api, next, currentStepId(next) === currentStepId(campaign))
    return true
  } catch (e) {
    set({ error: problem(e) })
    return false
  }
}

export function goToStep(i: number): void {
  const { steps } = useSettlement.getState()
  set({ cursor: Math.max(0, Math.min(steps.length - 1, i)), error: null })
}

/**
 * Close the step the player is looking at. A step with its own closing action runs it first; if the campaign is still on the
 * step afterwards, step.next moves it along. A step the campaign is not on (a preview) just moves the view.
 */
export function finishStep(): void {
  const { steps, cursor, campaign } = useSettlement.getState()
  const step = steps[cursor]
  if (!step || !campaign) return
  if (step.state !== 'current') { goToStep(cursor + 1); return }
  const seat = campaign.players[0]?.seat ?? 'A'
  if (step.finish !== null && step.finish !== undefined && !act(step.finish)) return
  const now = useSettlement.getState()
  if (currentStepId(now.campaign) === step.id && step.id !== 'toBattle') act({ type: 'step.next', seat })
}

/** Final states already applied (a second click on "Back to settlement" must not pay out twice). */
const applied = new WeakSet<object>()

/** Apply a finished battle to the campaign (game over). Resolves when saved; never throws. */
export async function applyFinishedBattle(finalState: unknown, opts?: { questCompleted?: boolean }): Promise<void> {
  try {
    const api = await loadCampaignApi()
    const c = useSettlement.getState().campaign ?? api.load()
    if (!c || !finalState) return
    if (typeof finalState === 'object') {
      if (applied.has(finalState as object)) return
      applied.add(finalState as object)
    }
    const next = api.fromBattle(c, finalState, opts)
    api.save(next)
    show(api, next)
  } catch (e) {
    set({ error: problem(e), loading: false })
  }
}

/** Mark the battle as running and hand back the game launch options; null (and a message) when the layer refuses. */
export function prepareBattle(pick: NextBattle): ReturnType<CampaignApi['startBattle']> | null {
  const { api, campaign } = useSettlement.getState()
  if (!api || !campaign) return null
  try {
    const r = api.startBattle(campaign, pick)
    api.save(r.campaign)
    show(api, r.campaign, true)
    return r
  } catch (e) {
    set({ error: problem(e) })
    return null
  }
}

// ---------- ?test=1: window.__campaign ----------
export interface CampaignTestApi {
  get(): CampaignDoc | null
  steps(): StepView[]
  view(): CampaignView | null
  /** Run a campaign action; returns false (and sets the error) when the layer refuses it. */
  dispatch(action: unknown): boolean
  error(): string | null
}
let installed = false
function installTestApi(): void {
  if (installed || typeof window === 'undefined') return
  try { if (new URLSearchParams(window.location.search).get('test') !== '1') return } catch { return }
  installed = true
  const g = (): SettlementState => useSettlement.getState()
  const api: CampaignTestApi = {
    get: () => g().campaign,
    steps: () => g().steps,
    view: () => g().view,
    dispatch: (a) => act(a),
    error: () => g().error,
  }
  ;(window as unknown as { __campaign: CampaignTestApi }).__campaign = api
}

/** The Quest card taken into the battle that just ended, or null (the game-over screen asks whether it was done). */
export async function pendingQuest(): Promise<{ cardId: string; name: string } | null> {
  try {
    const api = await loadCampaignApi()
    const c = useSettlement.getState().campaign ?? api.load()
    return c ? api.pendingQuest(c) : null
  } catch { return null }
}
