# 50: Client

React 19 + R3F 9 + drei + zustand. The client never mutates `GameState` and never computes a rules number; every hit
odds, damage, LOS verdict and range band comes from `engine.query.*` or `pending.context`. Generic over factions from
day one (no faction id literals outside `src/data/`).

## 1. Modules (M0 state in bold)

```
src/client/
  **App.tsx, GameScreen.tsx, store.ts, params.ts, theme.ts**   shell, screen state, test hooks, palette
  **board/**       Board (Canvas, lights, camera rig), Mat (procedural 36 x 36 in mat), Terrain (procedural pieces)
  **figures/**     Procedural.tsx placeholder figure on a 25/32/40 mm base; GLB loader arrives with M5 art
  **ui/**          StartScreen, styles.css
  presentation/    (M3) director: event batches to timed beats; presented store holds state as of the animation cursor
  interaction/     (M3) per-decision controllers, picking, drag movement with ruler preview, LOS view
  dice/            (M3) dice tray: one d20 skill die plus coloured d12 effect dice, every roll routes here
  audio/ vfx/      (M5)
```

## 2. Table and camera
- 36 x 36 in mat, dusty wasteland texture drawn on a canvas (no binary assets). Palette in `theme.ts`: rust, sand,
  faded teal.
- Camera presets in `board/Board.tsx`: overview, near seat, far seat, top down. The human seat is the near edge (+z).
  Right/middle drag orbits; a preset click resets the view.

## 3. Test hooks
`?test=1&seats=human,bot&seed=` (see 00 section 8). Stable `data-testid`s: `start-screen`, `start-button`,
`game-screen`, `cam-<preset>`, `board`.

## 4. Pages
Production base `/fell-in/`; asset URLs use `import.meta.env.BASE_URL`.
