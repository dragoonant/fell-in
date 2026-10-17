// Tiled CC0 ground (Poly Haven "Dry Ground 01", see public/assets/terrain/CREDITS.md) with a large-scale
// procedural tint layer multiplied over it, so close-ups are crisp and the overview never shows a tile grid.
import { CanvasTexture, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three'
import type { Texture, WebGLRenderer } from 'three'
import { PALETTE } from '../theme'

export const INCHES_PER_TILE = 7

const dir = (): string => `${import.meta.env.BASE_URL}assets/terrain/ground/`

/** Low-frequency stains and warm/cool drift, 2048 px across the whole mat (mid-grey = no change). */
function makeMacro(): CanvasTexture {
  const size = 2048
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'
  g.fillRect(0, 0, size, size)
  let s = 0x9e3779b9
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000 }
  const blob = (col: string, rmin: number, rmax: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = rnd() * size, y = rnd() * size, r = rmin + rnd() * (rmax - rmin)
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, col); grad.addColorStop(1, 'rgba(128,128,128,0)')
      g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2)
    }
  }
  blob('rgba(176,128,84,0.34)', 160, 460, 26) // warm rusty patches
  blob('rgba(210,196,160,0.30)', 140, 420, 26) // pale dust drifts
  blob('rgba(70,56,40,0.30)', 100, 340, 24) // dark stains
  blob('rgba(96,128,120,0.16)', 120, 320, 10) // faint faded-teal tint
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** `tint` multiplies the mat (a themed board passes its theme colour; default is the sand). */
export function makeGroundMaterial(w: number, d: number, gl: WebGLRenderer, tint: string = PALETTE.sand): MeshStandardMaterial {
  const loader = new TextureLoader()
  const aniso = gl.capabilities.getMaxAnisotropy()
  const repeat = new Vector2(w / INCHES_PER_TILE, d / INCHES_PER_TILE)
  const prep = (t: Texture, srgb: boolean): Texture => {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.copy(repeat)
    t.anisotropy = aniso
    t.generateMipmaps = true
    t.minFilter = LinearMipmapLinearFilter
    if (srgb) t.colorSpace = SRGBColorSpace
    return t
  }
  const load = (name: string, srgb: boolean) => prep(loader.load(`${dir()}dry_ground_01_${name}_2k.webp`), srgb)
  const macro = makeMacro()
  macro.anisotropy = aniso
  const mat = new MeshStandardMaterial({
    color: tint,
    map: load('diff', true),
    normalMap: load('nor_gl', false),
    roughnessMap: load('rough', false),
    roughness: 1,
    metalness: 0,
  })
  mat.normalScale.set(1.1, 1.1)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.macroMap = { value: macro }
    shader.uniforms.macroRepeat = { value: repeat }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D macroMap;\nuniform vec2 macroRepeat;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= texture2D(macroMap, vMapUv / macroRepeat).rgb * 3.2;')
  }
  return mat
}
