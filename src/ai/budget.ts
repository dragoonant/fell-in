// Deterministic cost counter shared by odds.ts and timeUp (types.ts): every odds cache miss is a real query.* call
// (LoS, attack plan, hit odds), weighted by the terrain pieces a line of sight is walked against (odds.ts), so a table
// of containers and school walls counts more per query than an open one. Machine speed never enters.
export const oddsStats = { misses: 0 }
/** Cost units of one dry run of an answer (a full engine step, dearer than a query miss). */
export const ACCEPT_COST = 15
