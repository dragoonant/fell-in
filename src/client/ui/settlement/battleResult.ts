// Game over -> settlement: hand the finished game to the campaign layer (fromBattle) before the settlement opens again.
// The final state is whole by now (the game is over, nothing is hidden), so the layer may read all of it.
import { applyFinishedBattle, pendingQuest } from './campaignStore'

/** `questCompleted`: the player says the Quest card they took into the battle was done. */
export async function applyBattleResult(finalState: unknown, opts?: { questCompleted?: boolean }): Promise<void> {
  await applyFinishedBattle(finalState, opts)
}

/** The Quest card the finished battle was fought with, or null (asked on the game-over screen). */
export const battleQuest = pendingQuest
