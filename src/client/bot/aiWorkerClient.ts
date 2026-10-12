// AI brain for the bot driver (spec 30 s11): posts the seat's view to src/ai/worker.ts and returns the action. When no
// Worker exists (node tests, old browsers) or the worker fails, the same decider runs on the main thread with
// accepts = gameStore.preview. Only view(state, seat), the open decision and the legal answers cross over.
import type { WorkerRequest, WorkerResponse } from '../../ai/worker'
import { aiBudgetMs, type Tier } from '../../ai/types'
import { createAiDecider, type AiDecider } from '../../ai/decider'
import type { Action } from '../../engine/types'
import { preview, useGameStore } from '../store/gameStore'
import { PARAMETERISED, type BotBrain } from './randomBot'

type Pending = { resolve: (a: Action) => void; reject: (e: Error) => void }

export interface WorkerLike {
  postMessage(m: WorkerRequest): void
  terminate?(): void
  onmessage: ((ev: { data: WorkerResponse }) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export interface AiBrainOptions {
  /** Test hook: supply a worker (or null to force the main-thread path). Default: a real module Worker if available. */
  makeWorker?: () => WorkerLike | null
}

function defaultWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null
  try { return new Worker(new URL('../../ai/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike } catch { return null }
}

/** Build the brain for a tier. Call dispose() to end the worker (new game or tier change). */
export function createAiBrain(tier: Tier, opts: AiBrainOptions = {}): BotBrain & { dispose(): void; readonly usesWorker: boolean } {
  let worker: WorkerLike | null | undefined
  let seq = 0
  const pending = new Map<number, Pending>()
  const local = new Map<string, AiDecider>()

  function failAll(msg: string): void {
    for (const p of pending.values()) p.reject(new Error(msg))
    pending.clear()
  }
  function ensureWorker(): WorkerLike | null {
    if (worker !== undefined) return worker
    const w = (opts.makeWorker ?? defaultWorker)()
    worker = w
    if (w) {
      w.onmessage = (ev) => {
        const r = ev.data
        if (r.type === 'ready') return
        const p = pending.get(r.id)
        if (!p) return
        pending.delete(r.id)
        if (r.type === 'action') p.resolve(r.action); else p.reject(new Error(r.message))
      }
      w.onerror = () => { worker = null; failAll('ai worker failed'); try { w.terminate?.() } catch { /* gone */ } }
    }
    return w
  }

  function mainThread(key: string, seed: string, view: Parameters<BotBrain>[0], p: Parameters<BotBrain>[1], legal: Action[], budgetMs: number): Action {
    const bundle = useGameStore.getState().bundle
    if (!bundle) throw new Error('ai: no bundle')
    let d = local.get(key)
    if (!d) { d = createAiDecider(tier, { seed, bundle, budgetMs, accepts: (a) => preview(a).ok }); local.set(key, d) }
    return d.decideSync(view, p, legal).action
  }

  const brain: BotBrain = async (view, p, legal, ctx) => {
    // Search budget well under the driver's race timeout so the answer lands before it gives up.
    const budgetMs = Math.min(ctx.budgetMs > 0 ? ctx.budgetMs * 0.5 : Infinity, aiBudgetMs())
    const key = `${ctx.seed}:${view.seat}`
    const w = ensureWorker()
    if (w) {
      try {
        const a = await new Promise<Action>((resolve, reject) => {
          const id = ++seq
          pending.set(id, { resolve, reject })
          w.postMessage({ type: 'decide', id, view, pending: p, legal, tier, seed: ctx.seed, memoryKey: key, budgetMs })
        })
        // The worker's shim cannot see everything the engine checks: confirm parameterised answers on the real state.
        if (!PARAMETERISED.has(a.type) || ctx.accepts(a)) return a
      } catch {
        // fall through to the main-thread decider for this decision
      }
    }
    return mainThread(key, ctx.seed, view, p, legal, budgetMs)
  }
  const out = brain as BotBrain & { dispose(): void; readonly usesWorker: boolean }
  out.dispose = () => { failAll('disposed'); try { worker?.terminate?.() } catch { /* gone */ } worker = undefined; local.clear() }
  Object.defineProperty(out, 'usesWorker', { get: () => !!worker })
  return out
}
