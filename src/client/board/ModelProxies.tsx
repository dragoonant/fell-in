// Invisible DOM proxies, one per model: data-testid="model-<id>" with data-x/data-z (inches), for e2e. ProxySync (inside
// the Canvas) moves each box to the model's projected screen position. pointer-events are off so the canvas keeps picking.
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { tweenPosition, useModelIds, usePresented, usePresentedModel, useTweens } from '../contract'

function Proxy({ id }: { id: string }) {
  const m = usePresentedModel(id)
  if (!m) return null
  return (
    <div data-model={id} data-testid={`model-${id}`} data-x={m.pos.x.toFixed(2)} data-z={m.pos.z.toFixed(2)} data-life={m.life}
      style={{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, marginLeft: -12, marginTop: -12, pointerEvents: 'none', opacity: 0 }} />
  )
}

export function ModelProxies() {
  const ids = useModelIds()
  return (
    <div data-testid="model-proxies" aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {ids.map((id) => <Proxy key={id} id={id} />)}
    </div>
  )
}

const v = new Vector3()
export function ProxySync() {
  const { camera, gl } = useThree()
  const state = usePresented()
  const tweens = useTweens()
  useFrame(() => {
    const root = gl.domElement.closest('[data-testid="board"]')?.querySelector('[data-testid="model-proxies"]')
    if (!root || !state) return
    const w = gl.domElement.clientWidth, h = gl.domElement.clientHeight
    camera.updateMatrixWorld()
    root.querySelectorAll<HTMLElement>('[data-model]').forEach((el) => {
      const id = el.dataset['model']!
      const m = state.models[id]
      if (!m) return
      const tw = tweens[id]
      const p = tw ? tweenPosition(tw) : m.pos
      v.set(p.x, m.elev + 1, p.z).project(camera)
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`
    })
  })
  return null
}
