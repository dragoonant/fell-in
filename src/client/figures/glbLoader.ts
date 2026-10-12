// Loads each GLB url at most once (module cache) WITHOUT suspending: callers get null until it is ready (or forever
// if it failed) and keep drawing the procedural stand-in. Geometry and materials are shared by every instance.
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Mesh, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

type Entry = { status: 'loading' | 'ready' | 'failed'; scene?: Object3D }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()

function request(url: string): Entry {
  let e = cache.get(url)
  if (e) return e
  const entry: Entry = { status: 'loading' }
  cache.set(url, entry)
  try {
    // models:optimize writes EXT_meshopt_compression, so the decoder is required.
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(url)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          if ((o as Mesh).isMesh) { (o as Mesh).castShadow = true; (o as Mesh).receiveShadow = true }
        })
        entry.scene = gltf.scene
        entry.status = 'ready'
      })
      .catch(() => { entry.status = 'failed' })
      .finally(() => listeners.forEach((l) => l()))
  } catch {
    entry.status = 'failed'
  }
  return entry
}

/** A private node-tree clone of the url's GLB, or null while loading / if unavailable / when url is undefined. */
export function useGlbInstance(url: string | undefined): Object3D | null {
  const invalidate = useThree((s) => s.invalidate)
  const [, setTick] = useState(0)
  const entry = url ? request(url) : undefined
  useEffect(() => {
    if (!url) return
    const l = () => { setTick((n) => n + 1); invalidate() }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [url, invalidate])
  const scene = entry?.status === 'ready' ? entry.scene : undefined
  const inst = useMemo(() => (scene ? cloneSkinned(scene) : null), [scene])
  useEffect(() => { if (inst) invalidate() }, [inst, invalidate])
  return inst
}

export const glbStatus = (url: string): 'idle' | 'loading' | 'ready' | 'failed' => cache.get(url)?.status ?? 'idle'
