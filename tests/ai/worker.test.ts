import { describe, expect, it, vi } from 'vitest'
import { createAiBrain, type WorkerLike } from '../../src/client/bot/aiWorkerClient'
import { launchTier } from '../../src/client/bot/botDriver'
import { createBotDriver } from '../../src/client/bot/botDriver'
import { handleRequest, type WorkerRequest, type WorkerResponse } from '../../src/ai/worker'
import { asTier, buildOptions } from '../../src/client/ui/start/startView'
import { launchGame, useLaunchStore } from '../../src/client/store/launch'
import { legalFor, newGame, ownerSeat, useGameStore } from '../../src/client/store/gameStore'
import { view } from '../../src/engine/view'

function openDecision() {
  newGame({ seed: 'w1', seats: ['bot', 'bot'] })
  const s = useGameStore.getState()
  const seat = ownerSeat(s.state!.pending, s)!
  return { s, seat, v: view(s.state!, seat), p: s.state!.pending, legal: legalFor(s.state!) }
}

describe('AI worker wiring', () => {
  it('AIW-001 handleRequest answers a decide request with a legal action', () => {
    const { s, v, p, legal } = openDecision()
    const r = handleRequest({ type: 'decide', id: 7, view: v, pending: p, legal, tier: 'normal', seed: 'w1', memoryKey: 'k' }, s.bundle!) as WorkerResponse
    expect(r.type).toBe('action')
    expect((r as { id: number }).id).toBe(7)
  })

  it('AIW-002 with no Worker the brain decides on the main thread', async () => {
    const { v, p, legal } = openDecision()
    const brain = createAiBrain('easy', { makeWorker: () => null })
    const a = await brain(v, p, legal, { seed: 'w1', budgetMs: 500, accepts: () => true })
    expect(legal.some((l) => l.type === a.type)).toBe(true)
    expect(brain.usesWorker).toBe(false)
  })

  it('AIW-003 a worker is used when present and gets view-only requests', async () => {
    const { s, v, p, legal } = openDecision()
    const seen: WorkerRequest[] = []
    const w: WorkerLike = {
      onmessage: null, onerror: null,
      postMessage(m) { seen.push(m); if (m.type === 'decide') { const r = handleRequest(m, s.bundle!)!; queueMicrotask(() => w.onmessage?.({ data: r })) } },
    }
    const brain = createAiBrain('normal', { makeWorker: () => w })
    await brain(v, p, legal, { seed: 'w1', budgetMs: 500, accepts: () => true })
    expect(seen).toHaveLength(1)
    const req = seen[0] as Extract<WorkerRequest, { type: 'decide' }>
    expect(req.tier).toBe('normal')
    expect(JSON.stringify(req)).not.toContain('"rng"')
    expect(brain.usesWorker).toBe(true)
  })

  it('AIW-004 a failing worker falls back to the main thread', async () => {
    const { v, p, legal } = openDecision()
    const w: WorkerLike = { onmessage: null, onerror: null, postMessage() { queueMicrotask(() => w.onerror?.(new Error('boom'))) } }
    const brain = createAiBrain('easy', { makeWorker: () => w })
    const a = await brain(v, p, legal, { seed: 'w1', budgetMs: 500, accepts: () => true })
    expect(legal.some((l) => l.type === a.type)).toBe(true)
  })

  it('AIW-005 the opponent tier travels in the launch options, default normal', () => {
    expect(buildOptions({ scenarioId: 'box-1', mode: 'bot', seed: '', sides: 2, tier: 'random' }).tier).toBe('random')
    expect(asTier('nonsense')).toBe('normal')
    launchGame({ seats: ['human', 'bot'], ...({ tier: 'easy' } as object) })
    expect(launchTier()).toBe('easy')
    launchGame({ seats: ['human', 'bot'] })
    expect(launchTier()).toBe('normal')
    useLaunchStore.setState({ screen: 'start', launch: null })
  })

  it('AIW-006 the driver plays bot decisions with the default tier and never forces', async () => {
    useLaunchStore.setState({ launch: null })
    newGame({ seed: 'w6', seats: ['bot', 'bot'] })
    const d = createBotDriver({ thinkMs: 0, budgetMs: 1500 })
    d.start()
    try {
      const t0 = Date.now()
      while (Date.now() - t0 < 20000 && (useGameStore.getState().state?.log.length ?? 0) < 8) await new Promise((r) => setTimeout(r, 20))
    } finally { d.stop() }
    expect(useGameStore.getState().state!.log.length).toBeGreaterThanOrEqual(8)
    expect(d.forced).toBe(0)
    vi.restoreAllMocks()
  })
})
