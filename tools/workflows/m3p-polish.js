export const meta = {
  name: 'm3p-polish',
  description: 'M3 polish: procedural audio and music, HUD declutter, GLB figure/terrain loader with weapon sockets',
  phases: [{ title: 'Polish', detail: 'three Sonnet agents, disjoint files, lean' }],
}

const ROOT = args && args.root
const WHI = args && args.whi
if (!ROOT || !WHI) throw new Error('pass args.root and args.whi')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only.
IP rule: all copy, sounds and visuals are original; no Fallout/Bethesda/Modiphius art, jingles, logos or trade dress.
Frozen: src/engine/**, src/data/**, data/**, src/client/{contract.ts,store/,presentation/}. Read them; report needed changes in issues.
Run long commands in the FOREGROUND. Never run npm install or git commit; never edit STATUS.md or package.json.
Never write the owner's real name or a C:\\Users\\<name> path into any repo file.
LEAN: owner wants polish, not test coverage. Write at most 3 small unit tests, run npm run typecheck and npm test once at the end and fix your own errors. No Playwright runs.
Reference (read-only, copy and adapt): ${WHI} (whirr-machine), map in docs/KNOWLEDGE-BASE.md 2.1 and 3.3.`

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'summary', 'files', 'issues'],
}
const KEEP = 'Return the schema object; summary and each issue 1-2 sentences; 300 tokens or fewer overall.'

const OWNERS = [
  { key: 'audio', own: 'src/client/audio/, src/client/weaponFlavour.ts, src/client/GameScreen.tsx (mount line only), public/sounds.html',
    task: `Procedural audio with Web Audio only (no audio files, no ElevenLabs yet). Adapt WHI src/client/audio/manager.ts (unlock on first click, master/sfx/music volume + mute persisted in localStorage with try/catch, throttling and detune jitter, music bus about -14 dB under SFX) but replace sample playback with synth recipes: ballistic pistol/rifle/shotgun shots (noise burst + low thump + short tail, crest high), laser (descending saw/square zap), plasma (bubbly FM whoosh), thrown explosion/grenade (filtered noise boom + rumble), melee hits (bat thud, blade swish, bite/claw), armor clink, hit/wound grunt as a filtered noise tick (no voices), death thud, footsteps/move shuffle, dice rattle for the d20 and d12s, UI click/confirm/cancel, round start sting, victory and defeat stings, radiation geiger crackle. src/client/weaponFlavour.ts maps weapon ids from data/1e/weapons to a flavour (longest-substring match) read by sound now and VFX later. Generative music: an original slow dusty western/post-atomic ambient loop (twangy plucked synth over a drone, sparse percussion, two moods: calm menu, tense battle) with crossfades of 1.5 s or more. Subscribe to presentation cues (onCue) to trigger sounds; never compute rules. Add a small sound/music toggle and volume popover in the corner (data-testid audio-toggle). public/sounds.html: an audition page that loads the built synth (or a standalone copy) with one button per sound id.` },
  { key: 'layout', own: 'src/client/ui/*.css, src/client/ui/start/start.css, src/client/dice/dice.css, src/client/ui/{Hud,TopBar,Roster,UnitCard,ActivationPanel,EventFeed,OddsPanel,Prompt}.tsx (layout/markup only), src/client/theme.ts',
    task: `HUD declutter and look. At 1280x800 the unit card covers the bottom-left, the prompt dock covers figures near the near edge, and the roster, feed and dice tray crowd the table. Make the table the hero: slimmer translucent rails that auto-collapse to icon tabs, the unit card shows on demand (hover/selection) as a compact card, the prompt dock is narrower and docks bottom-centre above a safe area, the feed is shorter with a fade, and the dice tray tucks bottom-right. Give it a coherent original post-atomic look (rust, sand, faded teal from theme.ts, a stencil-ish heading font from Google Fonts loaded in index.html is NOT allowed since you do not own it, so use a CSS font stack), with subtle panel textures via CSS gradients only. Check phone width does not break (single column, rails collapsed). Keep every data-testid and button text unchanged (e2e picks them exactly).` },
  { key: 'glb', own: 'src/client/figures/ (except Figures.tsx props contract), src/client/board/{Terrain.tsx,terrainFit.ts,terrainGlb.ts}, public/assets/models/manifest.json, tests/client/glb-*.test.ts',
    task: `GLB pipeline so generated models drop in as they arrive. Adapt WHI figures/{glbLoader,glbModels,GlbBody,Procedural fallback,facing} and board/{terrainFit,terrainGlb}: (1) unit figures from public/assets/models/units/<slug>.glb listed in public/assets/models/manifest.json (slug = unit id from data/1e/units), missing slug or file falls back to the current procedural figure with no 404s (only request listed slugs); (2) SEPARATE WEAPON MODELS (owner decision): figures are bare-handed; weapons load from public/assets/models/weapons/<slug>.glb (slug = weapon id) and attach to a hand socket. Sockets come from the manifest per unit ({rightHand:[x,y,z], rot}) with a sensible default by base size; show the model's currently equipped primary weapon from presented state (the model's carried weapons; ranged preferred when it last shot, melee when in close combat); missing weapon GLB shows a simple procedural stand-in (gun = box+barrel, melee = bar). (3) Terrain: GameState terrain pieces whose pieceId matches a slug in public/assets/models/terrain/manifest.json render that GLB fitted to the engine footprint (terrainFit, y up, origin bottom centre), else the current procedural piece. Do NOT touch public/assets/models/terrain/ (another agent is generating it; read its manifest at runtime only). Use import.meta.env.BASE_URL for URLs. Write the manifest.json with empty units/weapons maps and the socket defaults.` },
]

phase('Polish')
const out = await parallel(OWNERS.map(o => () => agent(`${COMMON}
Task (${o.key}): ${o.task}
You own ONLY: ${o.own}. Other agents edit other client files at the same time. ${KEEP}`,
  { label: `polish:${o.key}`, phase: 'Polish', schema: RESULT, model: 'sonnet' })))
return out
