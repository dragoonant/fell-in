// Maps a weapon id (data/1e/weapons) to a flavour read by sound now and VFX later. Longest substring match wins;
// ties go to the earlier table entry. Unknown ids fall back on the attack namespace.
export type WeaponFlavour = 'pistol' | 'rifle' | 'shotgun' | 'laser' | 'plasma' | 'explosive' | 'blunt' | 'blade' | 'bite' | 'claw'

const TABLE: [string, WeaponFlavour][] = [
  ['laser', 'laser'], ['plasma', 'plasma'], ['shotgun', 'shotgun'],
  ['grenade', 'explosive'], ['missile', 'explosive'], ['launcher', 'explosive'], ['mine', 'explosive'], ['dynamite', 'explosive'],
  ['rifle', 'rifle'], ['pistol', 'pistol'], ['revolver', 'pistol'], ['smg', 'rifle'], ['minigun', 'rifle'],
  ['bat', 'blunt'], ['board', 'blunt'], ['sledgehammer', 'blunt'], ['wrench', 'blunt'], ['hammer', 'blunt'], ['improvised', 'blunt'], ['club', 'blunt'], ['pipe', 'blunt'],
  ['knife', 'blade'], ['machete', 'blade'], ['sword', 'blade'], ['blade', 'blade'], ['axe', 'blade'], ['ripper', 'blade'],
  ['bite', 'bite'], ['swipe', 'claw'], ['crush', 'claw'], ['claw', 'claw'], ['slam', 'claw'],
]

export function weaponFlavour(weaponId: string, ns?: string): WeaponFlavour {
  const id = weaponId.toLowerCase()
  let best: WeaponFlavour | null = null
  let len = 0
  for (const [key, f] of TABLE) if (key.length > len && id.includes(key)) { best = f; len = key.length }
  if (best) return best
  if (ns === 'melee') return 'blunt'
  if (ns === 'throw' || ns === 'blast') return 'explosive'
  return 'pistol'
}
