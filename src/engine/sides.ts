// Teams and hostility (M4b, spec 18 s8.2/8.4). A seat's team is SeatState.team, else its scenario side, else the seat id.
// Seats on one team take turns together (co-op) and are never hostile to each other; scenario objects are never hostile
// to anyone (base contact with an object is not an engagement, SHOT-003). Tolerant of fixtures without `seats`.
import type { GameState, SeatId } from './types'

/** Owner id of the temporary stand-in model used to measure range, LoS and cover to a scenario object. */
export const OBJECT_OWNER = '__object__'

type Seated = Pick<GameState, 'seats'> & Partial<Pick<GameState, 'seatOrder'>>

export const teamOf = (s: Seated, seat: SeatId): string => s.seats?.[seat]?.team ?? s.seats?.[seat]?.side ?? seat
export const sameTeam = (s: Seated, a: SeatId, b: SeatId): boolean => a === b || teamOf(s, a) === teamOf(s, b)
/** Opposing owners (engagement, targets, cover, reactions). Objects are hostile to nobody. */
export const hostile = (s: Seated, a: SeatId, b: SeatId): boolean => a !== OBJECT_OWNER && b !== OBJECT_OWNER && !sameTeam(s, a, b)
/** Seats of this seat's team in seat order (always includes the seat). */
export function teamSeats(s: Seated, seat: SeatId): SeatId[] {
  const out = (s.seatOrder ?? [seat]).filter((x) => sameTeam(s, x, seat))
  return out.length ? out : [seat]
}
export const isAiSeat = (s: Seated, seat: SeatId): boolean => s.seats?.[seat]?.controller === 'official'
