# 60: Testing

Lean by default: about 10 focused tests per stage, plus the invariants below once the turn flow exists.

## 1. Layout and naming

| Path | Runner | Content |
|---|---|---|
| `tests/engine/*.test.ts` | vitest | rules and geometry by checklist ID |
| `tests/data/*.test.ts` | vitest | (M1) schema and cross-checks |
| `tests/ai/*.test.ts` | vitest | (M4) probability math, legality, safety |
| `tests/e2e/*.spec.ts` | Playwright | the production build served on `/fell-in/` |

Titles start with the checklist ID from `12-rules-test-checklist.md`: `it('LOS-002 ...')`. Current prefixes:
`GEOM- LOS- RNG- SETUP- VIEW- DECIDER-`; rules prefixes arrive with the spec.

## 2. Engine invariants (M2, in every sim game and a fuzz test)
- One open decision; `legalActions` non-empty and every member validates.
- Reject, never throw: malformed actions give a `Rejection` and the same state reference.
- Determinism: `(seed, action log)` reproduces the final state.
- Numbers come from state: a displayed odds figure equals what the roll resolves against.

## 3. Headless sim
`npm run sim -- --games 200 --seed s` (M0: harness shape only). Per-game decision cap, stall detector, wall-clock cap,
JSON summary; a failing seed becomes a fixture test.

## 4. Playwright
`playwright.config.ts` builds and previews on port 4191 (override with `PW_PORT`) at `/fell-in/`; every `page.goto`
is relative (`./?test=1&seed=demo`). WebGL runs on SwiftShader, so give 3D pages time to settle. The M0 spec writes
`screenshots/m0-table.png` (review only, not a baseline).
