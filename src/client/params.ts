// Test hooks: ?test=1&seats=human,bot&seed=abc (skips the start screen and exposes window.__game).
export interface Params { test: boolean; seats: string[]; seed: string; gallery: boolean; fps: boolean }
export function readParams(search = typeof location === 'undefined' ? '' : location.search): Params {
  const q = new URLSearchParams(search)
  return {
    test: q.get('test') === '1',
    seats: (q.get('seats') ?? 'human,bot').split(',').map((s) => s.trim()).filter(Boolean),
    seed: q.get('seed') ?? 'demo',
    gallery: q.has('gallery'),
    fps: q.has('fps'),
  }
}
