export const meta = {
  name: 'm6b-polish',
  description: 'Polish the visible problems the M5 and M6 check stages listed (start screen campaign entry, settlement layout, force pick, bottom-edge crowding), then re-shoot',
  phases: [{ title: 'Polish', detail: 'client polish and the carry-off engine fix in parallel, screenshots re-shot' }],
}

const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root')

const COMMON = `Project root: ${ROOT} (use absolute paths everywhere; the cwd resets). Orient from STATUS.md only (sections "Look and sound (M5)" and "Campaign and settlement (M6)"), then the files named below.
The engine owns every number the UI shows; the client never computes a rules number. Keep every data-testid and E2E text pick exactly (tests/e2e, tests/client). All copy in our own words.
Run long commands in the FOREGROUND (a dev server may go in the background). Never npm install, never git commit, never edit package.json or STATUS.md. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const KEEP = 'Return the schema object only; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

phase('Polish')
const [r, carry] = await parallel([
  () => agent(`${COMMON}
You own ONLY: src/client/ui/** (including settlement/**, start/**, the css files), src/client/audio/AudioHost.tsx (layout only), tests/client/**, tests/e2e/** (only to keep picks exact), screenshots/m5-theme-suburbs.png, screenshots/m6-start-campaign.png, screenshots/m6-settlement-new.png.
Read screenshots/m5-theme-suburbs.png, m6-start-campaign.png, m6-settlement-new.png and m6-game-from-battle.png first. Fix exactly these, found by the check stages at 1280x800:
1. Start screen: the Campaign block (new / continue) sits at the very bottom of a long page, below the fold. Put a "Campaign" mode card in the first screen-height next to the scenario picker (same visual weight as the Solo / Co-op entries), keeping the existing data-testids campaign-new and campaign-continue.
2. Settlement screen: the Next battle panel (scenario, opponent, seed) runs below the fold. Make the middle column scroll inside the viewport with the header fixed, and move Next battle above the current step's panel when the current step is "To battle" (or keep it in a right-column card that is always visible).
3. "Pick your force" can be left at 0 of 8 and To battle still fields the whole roster. If nothing was picked, To battle must either field the quick "regular force" pick automatically (say so in the step copy) or stay disabled with a plain-words hint; pick one, keep the campaign layer untouched (src/campaign is not yours: use its existing actions).
4. Game screen bottom edge: the Ready-to-begin bar and the Sound / Vol buttons still crowd each other and the key hints at 1280x800. Give the bottom edge one layout: prompt bar centred, sound controls and key hints in the bottom-right stack with 8 px gaps, nothing overlapping at 1280x800 or 1024x768.
5. The game launched from To battle opens with the briefing modal over a table that renders darker than a normal launch (see m6-game-from-battle.png versus m5-theme-suburbs.png). Find why (a theme or lighting param not passed from the campaign launch, or the modal backdrop) and fix it at the root.
Then npm run typecheck && npm test && npm run build && npm run e2e, and re-shoot the three screenshots you own with Playwright at 1280x800 (dev server on 5191, start it in the background if it is down; --wait-for-timeout 12000) and READ them to confirm each fix. ${KEEP}`,
  { label: 'polish:client', phase: 'Polish', schema: RESULT, model: 'sonnet' }),
  () => agent(`${COMMON}
You own ONLY: src/engine/movement.ts, src/engine/scenarios/** (never the frozen files), tests/engine/**, docs/needs-rules-check.md (append).
The versus-bot verify pass found that carry-off victories can never fire: when a model carrying a scenario marker (props.carry, e.g. the mini nuke in box-2) leaves the table through moveTo in src/engine/movement.ts, removeModel runs before the carried markers get props.offTable = true, so the scenario's carry-off victory check (src/engine/scenarios/rules.ts and status.ts; read docs/spec/17-scenarios.md for the rule) never sees the marker off the table. Fix it at the root (mark the carried markers off table, with the carrying seat, before the model is removed; keep every other exit path identical), add a test named by the matching checklist ID in docs/spec/12 (grep for carry-off / carried marker), and run npm run typecheck && npm test && npm run sim -- --games 20 --seed 1 (0 errors). Then run npm run bench:ai -- --games 30 --a normal --b random and report winRate, draws and losses in issues. Also append one RULING: box-1 (Ad Victoriam) with elimination-only victory often ends in a draw after six rounds; record "owner decision needed: points-at-timeout or as printed" with status Unsourced. ${KEEP}`,
    { label: 'engine:carry-off', phase: 'Polish', schema: RESULT, model: 'sonnet' }),
])
return { polish: r, carry }
