// Interaction (owner I). Two slots, keep both export names:
//   <Interaction/>       DOM overlay rendered by GameScreen above the canvas (ruler readout, target odds, confirm chooser, keys).
//   <InteractionScene/>  R3F content mounted by the Board inside <Canvas> (picking rings, drag ghost, LOS and ruler lines).
// Everything answers through contract game.submit/choose with actions from the open decision. Numbers shown (odds, band,
// cover, distance, ruler colour) come from the contract's query hooks or the decision's context.
import { useEffect, useRef, type CSSProperties } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { baseRadius } from '../../engine/geometry'
import type { ModelId, Vec2 } from '../../engine/types'
import {
  colourFor, modelName, queryDistance, useCover, useGame, useHitOdds, useLos, useModelIds, usePending, usePresentedModel,
  usePresentedModels, useRangeBand, type AttackOpts,
} from '../contract'
import { PALETTE } from '../theme'
import { canPlaceOnTable, clickModel, commitGhost, computeGhost, onKey, setCtx, submitOption } from './controller'
import { CLICK_PX, pathModelId, pathOption, pickables, rayToTable, readoutText } from './helpers'
import { ix, useInteractionStore } from './store'

/** Cosmetic swatches for ruler colour names (the edition decides the names and lengths). */
const SWATCH: Record<string, string> = { orange: '#d9822b', yellow: '#e0c53a', red: '#c0392b', green: '#4c9a4c', blue: '#3f7fc0', black: '#222222' }
const swatch = (c: string | null): string => (c && SWATCH[c]) || PALETTE.bone

/** The model whose decision this is: the context model, else the activating one. */
function useActor(): ModelId | null {
  const pending = usePending()
  const { state } = useGame()
  const c = pending?.context.modelId
  return typeof c === 'string' ? c : state?.activation?.modelId ?? null
}

/** Options for the odds queries, taken from the option the hover would answer. */
function useHoverOpts(hover: ModelId | null): AttackOpts | undefined {
  const pending = usePending()
  const o = hover ? pickables(pending).get(hover)?.options[0]?.action : undefined
  if (!o) return undefined
  const opts: AttackOpts = {}
  if (typeof o.weaponUid === 'string') opts.weaponUid = o.weaponUid
  if (o.band === 'short' || o.band === 'long') opts.band = o.band
  return opts
}

// =====================================================================================================
// DOM overlay
// =====================================================================================================
const panel: CSSProperties = { background: 'rgba(29,26,22,.88)', color: PALETTE.bone, border: `1px solid ${PALETTE.teal}`, borderRadius: 4, padding: '6px 10px', fontSize: 13 }

export function Interaction() {
  const pending = usePending()
  const { state } = useGame()
  const ghost = useInteractionStore((s) => s.ghost)
  const hover = useInteractionStore((s) => s.hover)
  const choice = useInteractionStore((s) => s.choice)
  const measure = useInteractionStore((s) => s.measure)
  const los = useInteractionStore((s) => s.los)
  const actor = useActor()
  const target = hover && hover !== actor ? hover : null
  const pick = target ? pickables(pending).get(target) : undefined
  const showTarget = !!target && !!actor && (pick?.role === 'target' || los || measure)
  const opts = useHoverOpts(target)
  const odds = useHitOdds(showTarget ? actor : null, target, opts)
  const band = useRangeBand(showTarget ? actor : null, target, opts?.weaponUid)
  const cover = useCover(showTarget ? actor : null, target)
  const sight = useLos(showTarget ? actor : null, target)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (onKey(e)) e.preventDefault() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { ix.resetPrompt() }, [pending?.id])

  const pOpt = pathOption(pending)
  const ctxColour = typeof pending?.context.colour === 'string' ? pending.context.colour : null
  const ctxInches = typeof pending?.context.inches === 'number' ? pending.context.inches : null
  const dist = showTarget && measure && actor && target ? queryDistance(actor, target) : null

  return (
    <div data-testid="interaction" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, fontFamily: 'inherit' }}>
      <div style={{ position: 'absolute', top: 52, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {pOpt && ghost && (
          <div data-testid="ruler-readout" style={panel}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: swatch(ghost.colourNeeded), marginRight: 6, border: '1px solid #000' }} />
            {readoutText({ travel: ghost.travel, colourNeeded: ghost.colourNeeded, limitColour: ctxColour, limitInches: ctxInches, ok: ghost.ok })}
            {!ghost.ok && ghost.detail ? ` | ${ghost.detail}` : ''}
          </div>
        )}
        {pOpt && !ghost && <div style={panel} data-testid="move-hint">Drag the model or click the table to move. Esc cancels.</div>}
        {showTarget && target && (
          <div data-testid="target-readout" style={panel}>
            <strong>{modelName(state, target)}</strong>
            {odds && ` | ${Math.round(odds.pHit * 100)}% to hit`}
            {band && band.band && ` | ${band.band} range, ${band.distance.toFixed(1)} in`}
            {band && !band.band && ' | out of range'}
            {cover && ` | ${cover.cover ? `cover x${cover.count}` : 'no cover'}`}
            {sight && ` | ${sight.visible ? 'line of sight clear' : `no line of sight (${sight.reasons.join(', ')})`}`}
            {dist != null && Number.isFinite(dist) && ` | ${dist.toFixed(1)} in (${colourFor(dist) ?? 'beyond every'} ruler)`}
          </div>
        )}
      </div>
      {choice && (
        <div data-testid="choice" style={{ ...panel, pointerEvents: 'auto', position: 'absolute', bottom: 96, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 520 }}>
          <span style={{ width: '100%' }}>{modelName(state, choice.targetId)}</span>
          {choice.options.map((o) => <button key={o.id} data-testid={`choice-${o.id}`} onClick={() => submitOption(o)}>{o.label}</button>)}
          <button onClick={() => ix.setChoice(null)}>Back</button>
        </div>
      )}
      <div style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 11, opacity: 0.75, color: PALETTE.bone, textAlign: 'right' }}>
        <span style={{ opacity: measure ? 1 : 0.7 }}>M ruler{measure ? ' on' : ''}</span> | <span style={{ opacity: los ? 1 : 0.7 }}>L line of sight{los ? ' on' : ''}</span> | Esc cancel
      </div>
    </div>
  )
}

// =====================================================================================================
// R3F scene
// =====================================================================================================
type Controls = { enabled: boolean } | null

function Bridge() {
  const pending = usePending()
  const models = usePresentedModels()
  setCtx(pending, models)
  return null
}

/** Window-level pointer tracking so a drag keeps following the pointer over the HUD, plus click-to-move. */
function PointerRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as Controls
  const ctl = useRef<Controls>(controls)
  ctl.current = controls
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const at = (e: PointerEvent): Vec2 | null => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      return rayToTable(ray.ray.origin, ray.ray.direction)
    }
    const inside = (e: PointerEvent): boolean => { const r = el.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }
    let down: { x: number; y: number; onCanvas: boolean; onModel: boolean } | null = null
    let last = 0
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, onCanvas: e.target === el, onModel: !!useInteractionStore.getState().drag } }
    const onMove = (e: PointerEvent) => {
      if (!canPlaceOnTable()) return
      const d = useInteractionStore.getState().drag
      if (d && !d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= CLICK_PX) ix.dragMoved()
      if (!d && e.target !== el) return
      if (e.buttons !== 0 && !d) return // an orbit gesture
      const now = performance.now()
      if (now - last < 33) return
      last = now
      const p = at(e)
      if (p) ix.setGhost(computeGhost(p))
    }
    const onUp = (e: PointerEvent) => {
      const d = useInteractionStore.getState().drag
      ix.endDrag()
      if (ctl.current) ctl.current.enabled = true
      const dn = down
      down = null
      if (!canPlaceOnTable() || e.button !== 0) return
      if (d?.moved) {
        const p = inside(e) ? at(e) : null
        if (p) commitGhost(computeGhost(p))
        else ix.setGhost(null)
        return
      }
      if (dn && dn.onCanvas && !dn.onModel && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < CLICK_PX && e.target === el) {
        const p = at(e)
        if (p) commitGhost(computeGhost(p))
      }
    }
    const onCancel = () => { ix.endDrag(); ix.setGhost(null); if (ctl.current) ctl.current.enabled = true }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel)
    }
  }, [camera, gl])
  return null
}

function Ring({ r, color, y = 0.05, opacity = 0.9, width = 0.12 }: { r: number; color: string; y?: number; opacity?: number; width?: number }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} renderOrder={5}>
      <ringGeometry args={[Math.max(0.01, r - width), r + width, 40]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** Invisible hit target plus a highlight ring for one model. */
function ModelPick({ id, actorPathId }: { id: ModelId; actorPathId: ModelId | null }) {
  const m = usePresentedModel(id)
  const pending = usePending()
  const selected = useInteractionStore((s) => s.selected === id)
  const hovered = useInteractionStore((s) => s.hover === id)
  const tools = useInteractionStore((s) => s.measure || s.los)
  const controls = useThree((s) => s.controls) as Controls
  if (!m || m.life === 'dead' || m.offTable) return null
  const pick = pickables(pending).get(id)
  const r = baseRadius(m.base)
  const draggable = actorPathId === id
  const ring = pick ? (pick.role === 'select' ? PALETTE.teal : PALETTE.rust) : draggable ? PALETTE.sand : selected ? PALETTE.bone : hovered && tools ? PALETTE.dust : null
  return (
    <group position={[m.pos.x, m.elev, m.pos.z]}>
      <mesh
        position-y={0.8}
        onPointerOver={(e) => { e.stopPropagation(); ix.setHover(id) }}
        onPointerOut={() => { if (useInteractionStore.getState().hover === id) ix.setHover(null) }}
        onPointerDown={(e) => {
          if (!draggable || e.button !== 0 || !pending) return
          ix.startDrag({ modelId: id, promptId: pending.id, sx: e.clientX, sy: e.clientY, moved: false })
          if (controls) controls.enabled = false
        }}
        onClick={(e) => { if (e.button === 0 && e.delta < CLICK_PX && !draggable) { e.stopPropagation(); clickModel(id) } }}
      >
        <cylinderGeometry args={[r + 0.15, r + 0.15, 1.6, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {ring && <Ring r={r + 0.2} color={ring} opacity={hovered ? 1 : 0.75} />}
    </group>
  )
}

function Ghost() {
  const ghost = useInteractionStore((s) => s.ghost)
  const pending = usePending()
  const id = pathModelId(pending, pathOption(pending))
  const m = usePresentedModel(id)
  if (!ghost || !m) return null
  const color = ghost.ok ? swatch(ghost.colourNeeded) : PALETTE.rust
  const r = baseRadius(m.base)
  return (
    <group>
      <group position={[ghost.pos.x, 0, ghost.pos.z]}>
        <Ring r={r} color={color} width={0.1} opacity={0.95} />
        <mesh rotation-x={-Math.PI / 2} position-y={0.04}>
          <circleGeometry args={[r, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      </group>
      <Line points={[[ghost.from.x, 0.1, ghost.from.z], [ghost.pos.x, 0.1, ghost.pos.z]]} color={color} lineWidth={3} dashed dashSize={0.5} gapSize={0.3} />
    </group>
  )
}

/** LOS line (L, or any hovered target) and ruler line (M) from the acting model to the hovered one. */
function Lines() {
  const actor = useActor()
  const hover = useInteractionStore((s) => s.hover)
  const los = useInteractionStore((s) => s.los)
  const measure = useInteractionStore((s) => s.measure)
  const pending = usePending()
  const a = usePresentedModel(actor)
  const t = usePresentedModel(hover)
  const isTarget = !!hover && pickables(pending).get(hover)?.role === 'target'
  const target = hover && hover !== actor ? hover : null
  const sight = useLos(actor, target)
  if (!a || !t || !target || !(isTarget || los || measure)) return null
  const pa: [number, number, number] = [a.pos.x, a.elev + 1, a.pos.z]
  const pt: [number, number, number] = [t.pos.x, t.elev + 1, t.pos.z]
  const color = measure && !los && !isTarget ? PALETTE.sand : sight?.visible ? PALETTE.teal : PALETTE.rust
  return <Line points={[pa, pt]} color={color} lineWidth={2.5} dashed={!sight?.visible} dashSize={0.6} gapSize={0.4} />
}

function PulseCursor() {
  // Keeps a demand frameloop alive while a ghost shows (the pointer moves no store the canvas watches otherwise).
  const invalidate = useThree((s) => s.invalidate)
  useFrame(() => { if (useInteractionStore.getState().ghost) invalidate() })
  return null
}

export function InteractionScene() {
  const ids = useModelIds()
  const pending = usePending()
  const actorPathId = pathModelId(pending, pathOption(pending))
  return (
    <>
      <Bridge />
      <PointerRig />
      <PulseCursor />
      {ids.map((id) => <ModelPick key={id} id={id} actorPathId={actorPathId} />)}
      <Ghost />
      <Lines />
    </>
  )
}
