// localStorage behind try/catch (private windows, blocked storage, node tests fall back to memory). No engine imports.
const memory = new Map<string, string>()

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

export function readRaw(key: string): string | null {
  try { const s = ls(); return s ? s.getItem(key) : memory.get(key) ?? null } catch { return memory.get(key) ?? null }
}
export function writeRaw(key: string, value: string): boolean {
  try { const s = ls(); if (s) s.setItem(key, value); else memory.set(key, value); return true } catch { memory.set(key, value); return false }
}
export function removeKey(key: string): void {
  memory.delete(key)
  try { ls()?.removeItem(key) } catch { /* storage blocked */ }
}
export function readJson<T>(key: string): T | null {
  const raw = readRaw(key)
  if (raw === null) return null
  try { return JSON.parse(raw) as T } catch { return null }
}
export function writeJson(key: string, value: unknown): boolean {
  try { return writeRaw(key, JSON.stringify(value)) } catch { return false }
}
