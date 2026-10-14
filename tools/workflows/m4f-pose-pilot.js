export const meta = {
  name: 'm4f-pose-pilot',
  description: 'Plan B pilot: regenerate Sole Survivor (long gun) and Super Mutant (long gun, heavy) in two-handed poses with grip + support sockets, and pose selection by weapon class in the client',
  phases: [
    { title: 'Build', detail: 'asset pipeline (GPU, owner-approved) + client pose selection in parallel' },
    { title: 'Check', detail: 'gallery close-ups, tune sockets, gate' },
  ],
}

const ROOT = args && args.root
if (!ROOT) throw new Error('pass args.root')

const COMMON = `Project root: ${ROOT} (use absolute paths; the cwd resets). Orient from STATUS.md only, then the files named below.
CONTEXT: figures are static Hunyuan3D meshes (public/assets/models/units/<id>.glb) with one fist socket ("hand" in public/assets/models/manifest.json; read the manifest note). Weapons are separate GLBs (weapons/<id>.glb, origin at the grip, barrel along +z) placed by weapon class (src/client/figures/{equipped.ts,glbModels.ts}, HOLDS). Rifles still look one-handed. Owner approved plan B as a PILOT on two figures; the owner reviews before the rest are done.
FROZEN SHAPE (both agents code to it): a manifest units entry may gain
  "poses": { "<class>": { "file": "units/<id>@<class>.glb", "hand": [x,y,z], "support": [x,y,z], "yaw"?: r, "height"?: n } }
where <class> is one of the existing hold classes (long, heavy, melee2, ...). hand = the grip-hand socket, support = the off-hand socket, both in the FITTED figure frame like the existing "hand" (inches, origin at base centre, front +z, after yaw and height fit). When a unit holds a weapon whose class has a pose, the client renders that pose GLB instead of the default one and places the weapon with its grip at hand and its barrel axis pointing from hand through support (roll: weapon up = figure up). Otherwise the current behaviour stays.
IP rule: original designs; no Modiphius/Bethesda art, logos or trade dress; proportion words from CLAUDE.md, never the banned words.
Run long commands in the FOREGROUND. Never npm install or git commit; never edit STATUS.md or package.json. Never write the owner's real name or a C:\\Users\\<name> path into any repo file.`

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

phase('Build')
const [assets, client] = await parallel([
  () => agent(`${COMMON}
You own ONLY: public/assets/models/units/{sole-survivor,super-mutant}@*.glb (new files) and the "poses" entries for those two units in public/assets/models/manifest.json.
GPU work is APPROVED by the owner for this pilot only. Follow docs/KNOWLEDGE-BASE.md section 3 exactly (3.1 Gemini via Claude in Chrome with the hidden file input, never the system clipboard; 3.2 the local Hunyuan3D pipeline; the optimizer tools/models/optimize.mjs). Load Claude in Chrome tools via ToolSearch first and confirm a browser is connected; stop and report if not.
Make three pose variants that match the existing figure's look (feed the current figure's concept or a render of units/<id>.glb as the reference so face, outfit and colours match):
 1 sole-survivor@long: two-handed rifle stance at low ready, both hands closed as if gripping a rifle (trigger hand at the hip-chest, support hand forward), HANDS EMPTY (no weapon in the image),
 2 super-mutant@long: same two-handed rifle grip, hands empty,
 3 super-mutant@heavy: a shoulder-mounted heavy weapon stance (trigger hand under the shoulder, support hand forward and up), hands empty.
Same base, scale and facing conventions as the existing GLBs. Optimize each (<= ~2 MB). Measure hand and support sockets from each mesh (find the two fists; render orthographic front/side views to check), fill the poses entries per the frozen shape, and verify with a quick render that a straight line hand->support runs where a barrel should. Never commit; never put concept images in the repo. ${KEEP}`,
    { label: 'assets:poses', phase: 'Build', schema: RESULT }),
  () => agent(`${COMMON}
You own ONLY: src/client/figures/**, tests/client/glb-pipeline.test.ts, tests/client/figures-*.test.ts.
Implement the frozen poses shape: parse "poses" in the manifest parser (tolerate missing/malformed), pick the pose GLB by the held weapon's class, fit it exactly like the default GLB, and orient the weapon from hand toward support (keep weapon up aligned with figure up; scale untouched). Preload pose GLBs lazily. Keep HOLDS as the fallback. In ?gallery add a weapon picker or entries showing a figure with each weapon class so the pilot can be reviewed. Unit tests for parsing and the hand->support orientation math. npm run typecheck && npm test && npm run build must pass. ${KEEP}`,
    { label: 'client:poses', phase: 'Build', schema: RESULT, model: 'sonnet' }),
])
log(`assets: ${assets ? assets.summary : 'FAILED'}`)
log(`client: ${client ? client.summary : 'FAILED'}`)

phase('Check')
const gate = await agent(`${COMMON}
You own ONLY: the "poses" socket numbers in public/assets/models/manifest.json and trivial fixes in src/client/figures/** (no GPU work, no new GLBs).
Start the dev server in the background only if http://localhost:5191/fell-in/ is down (npx vite --port 5191). With Playwright (temp dir script) at 1280x800 render ?gallery close-ups, front and three-quarter: Sole Survivor with hunting-rifle and combat-shotgun; Super Mutant with bolt-action-pipe-rifle and missile-launcher; and one in-game shot (?seats=human,bot&scenario=box-2 or another scenario where these units carry these weapons, briefing closed). Read the screenshots. If the weapon misses either hand by more than about 0.1 in or clips through the body, tune the socket numbers and re-check (up to 3 rounds). Then run npm run typecheck, npm test, npm run build. Save a labelled before/after sheet (current default pose vs new pose, same weapons) at ${ROOT}/screenshots/m4f-pose-pilot.png. ${KEEP}`,
  { label: 'check:gallery', phase: 'Check', schema: RESULT, model: 'sonnet' })

return { assets, client, gate }
