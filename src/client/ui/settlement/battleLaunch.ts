// Turns the campaign layer's battle setup (toBattle) plus the player's pick (scenario, opponent, seed) into the options the normal
// game launch takes. Pure: no engine, no data, no campaign layer (the unit test covers it).
import type { CampaignForce, NewGameOptions, NextBattle, SeatController } from './model'

/** The part of the layer's BattleSetup the client launch needs (CreateGameOpts without the extras). */
export interface EngineSetup {
  seed: string
  scenarioId?: string
  forces?: Record<string, CampaignForce[]>
  campaign?: NewGameOptions['campaign']
}

export function seatsFor(opponent: NextBattle['opponent']): SeatController[] {
  return opponent === 'human' ? ['human', 'human'] : opponent === 'official' ? ['human', 'official'] : ['human', 'bot']
}

/** Seat ids the client store hands out: people and bots are A, B; the official AI seat is 'ai'. */
export function seatIdsFor(seats: readonly SeatController[]): string[] {
  let n = 0
  return seats.map((c) => (c === 'official' ? 'ai' : String.fromCharCode(65 + n++)))
}

/** Launch options: the campaign player is always the first seat; the other side keeps the scenario's own force. */
export function launchOptions(setup: EngineSetup, pick: NextBattle): NewGameOptions {
  const forces = setup.forces && Object.keys(setup.forces).length ? setup.forces : undefined
  return {
    scenarioId: setup.scenarioId ?? pick.scenarioId,
    seats: seatsFor(pick.opponent),
    seed: setup.seed,
    ...(forces ? { forces } : {}),
    ...(setup.campaign ? { campaign: setup.campaign } : {}),
    fromCampaign: true,
  }
}

/** Why a scenario cannot face the chosen opponent (plain words), or null. */
export function opponentProblem(opponent: NextBattle['opponent'], scenario: { sides: number; aiSideId?: string } | undefined): string | null {
  if (!scenario) return null
  if (opponent === 'official' && !scenario.aiSideId) return 'The Wasteland AI only plays scenarios written for it. Pick a solo or co-op scenario, or another opponent.'
  if (opponent !== 'official' && scenario.sides < 2) return 'That scenario is a one-sided tutorial. Pick a two-sided scenario for a campaign battle.'
  return null
}
