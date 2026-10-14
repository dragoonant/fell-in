// Small labels above each objective marker on the table (positions come from the engine's objective status).
// Plain DOM elements projected every frame: drei's <Html> mounts a nested React root per label, and unmounting those
// during a render (the marker list re-keys as the state changes) dropped labels, so the dev build lost one or all of them.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useObjectiveStatus } from '../contract'

/** Friendlier wording for markers whose face is still hidden. */
const FRIENDLY: Record<string, string> = { 'Unknown marker': 'Hidden token' }
const LABEL_Y = 2.2

interface Item { id: string; x: number; z: number; wrap: HTMLDivElement }

export function ObjectiveLabels() {
  const status = useObjectiveStatus()
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const items = useRef<Item[]>([])
  const tmp = useRef(new Vector3())

  // Rebuild the label elements whenever the marker set (ids, wording or positions) changes.
  const sig = status ? status.markers.map((m) => `${m.id}|${m.label}|${m.x.toFixed(2)}|${m.z.toFixed(2)}`).join(';') : ''
  useEffect(() => {
    const parent = gl.domElement.parentElement
    if (!parent || !status) { items.current = []; return }
    const layer = document.createElement('div')
    layer.className = 'obj-label-layer'
    layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none'
    items.current = status.markers.map((m) => {
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;display:none'
      const label = document.createElement('div')
      label.className = 'obj-label'
      label.dataset.testid = `obj-label-${m.id}`
      label.textContent = FRIENDLY[m.label] ?? m.label
      wrap.appendChild(label)
      layer.appendChild(wrap)
      return { id: m.id, x: m.x, z: m.z, wrap }
    })
    parent.appendChild(layer)
    invalidate()
    return () => { layer.remove(); items.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, gl, invalidate])

  useFrame(({ camera, size }) => {
    for (const it of items.current) {
      const v = tmp.current.set(it.x, LABEL_Y, it.z).project(camera)
      if (v.z > 1 || v.z < -1) { it.wrap.style.display = 'none'; continue }
      it.wrap.style.display = 'block'
      it.wrap.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
    }
  })
  return null
}
