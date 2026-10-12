// Camera: right-drag orbit, middle-drag / WASD pan, wheel zoom. Preset changes (store.ts) ease over CAMERA_TRANSITION_MS.
import { useEffect, useRef, type ReactElement } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { useStore } from '../store'
import { CAMERA_TRANSITION_MS, cameraPose, easeInOut } from './layout'
import { usePresented } from '../contract'

const PAN_KEYS: Record<string, [number, number]> = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] }

export function CameraRig(): ReactElement {
  const controls = useRef<OrbitImpl>(null)
  const { camera, invalidate, gl } = useThree()
  const preset = useStore((s) => s.preset)
  const tick = useStore((s) => s.presetTick)
  const table = usePresented()?.scenario.table ?? { w: 36, d: 36 }
  const tween = useRef<{ t0: number; fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3 } | null>(null)
  const keys = useRef(new Set<string>())

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const pose = cameraPose(preset, table)
    tween.current = { t0: performance.now(), fromP: camera.position.clone(), toP: new THREE.Vector3(...pose.pos), fromT: c.target.clone(), toT: new THREE.Vector3(...pose.target) }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, tick])

  // test hooks (?test=1): window.__screen(x, z, y?) -> page pixels; window.__camera(pos, target) jumps the camera
  useEffect(() => {
    const w = window as unknown as {
      __game?: unknown; __camera?: (p: [number, number, number], t: [number, number, number]) => void
      __screen?: (x: number, z: number, y?: number) => { x: number; y: number }
    }
    if (!w.__game) return
    w.__screen = (x, z, y = 0) => {
      camera.updateMatrixWorld()
      const v = new THREE.Vector3(x, y, z).project(camera)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
    w.__camera = (p, t) => {
      const c = controls.current
      if (!c) return
      tween.current = null
      camera.position.set(...p); c.target.set(...t); c.update(); invalidate()
    }
    return () => { delete w.__camera; delete w.__screen }
  }, [camera, invalidate, gl])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) }
    const down = (e: KeyboardEvent) => { if (typing(e) || e.ctrlKey || e.metaKey) return; const k = e.key.toLowerCase(); if (k in PAN_KEYS) { keys.current.add(k); invalidate() } }
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key.toLowerCase()) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [invalidate])

  const fwd = useRef(new THREE.Vector3()), right = useRef(new THREE.Vector3())
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const tw = tween.current
    if (tw) {
      const f = Math.min(1, (performance.now() - tw.t0) / CAMERA_TRANSITION_MS)
      const e = easeInOut(f)
      camera.position.lerpVectors(tw.fromP, tw.toP, e)
      c.target.lerpVectors(tw.fromT, tw.toT, e)
      c.update()
      if (f >= 1) tween.current = null
      invalidate()
    }
    if (keys.current.size) {
      camera.getWorldDirection(fwd.current); fwd.current.y = 0; fwd.current.normalize()
      right.current.crossVectors(fwd.current, camera.up).normalize()
      const speed = 22 * Math.min(dt, 0.05)
      for (const k of keys.current) {
        const [dx, dz] = PAN_KEYS[k]!
        const move = right.current.clone().multiplyScalar(dx * speed).addScaledVector(fwd.current, -dz * speed)
        camera.position.add(move); c.target.add(move)
      }
      c.update()
      invalidate()
    }
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={8}
      maxDistance={Math.max(table.w, table.d) * 2.4}
      mouseButtons={{ LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      screenSpacePanning={false}
    />
  )
}
