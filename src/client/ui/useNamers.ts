// Namers for the HUD: unit names from data via the contract's label helpers.
import { useMemo } from 'react'
import { dataName, modelName, rollLabel, seatLabel, usePresented } from '../contract'
import type { FeedNamers } from './feedView'
import { humaniseLabel } from './format'
import type { Namers } from './promptView'

export function useNamers(): Namers & FeedNamers {
  const state = usePresented()
  return useMemo(() => {
    const names: Record<string, string> = {}
    if (state) for (const id of Object.keys(state.models)) names[id] = modelName(state, id)
    const name = (id: string) => names[id] ?? (id ? dataName(id) : 'someone')
    return { name, seat: (id: string) => seatLabel(id), humanise: (l: string) => humaniseLabel(l, names), roll: rollLabel, data: dataName }
  }, [state])
}
