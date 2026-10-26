/**
 * Weapon definitions shared by the trigger latch, the HUD and the 3D view.
 *
 * The desktop room server rejects shots that arrive less than 120 ms after the
 * previous one (`FIRE_COOLDOWN_MS`). Client intervals deliberately sit above
 * that limit so full-auto never spends its cadence on rejected shots.
 */

export type WeaponId = 'rifle' | 'pistol'
export type FireMode = 'auto' | 'semi'

/** Keep in sync with `FIRE_COOLDOWN_MS` in the desktop LAN server. */
export const SERVER_FIRE_COOLDOWN_MS = 120

export interface WeaponSpec {
  id: WeaponId
  name: string
  fireMode: FireMode
  fireModeLabel: string
  /** Minimum interval between trigger starts, measured from shot start. */
  fireIntervalMs: number
  /** Time to lower the current view model. */
  switchOutMs: number
  /** Time to raise the next view model. */
  switchInMs: number
  /** Peak recoil used by BattleScene. */
  recoil: number
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: 'rifle',
    name: '步枪',
    fireMode: 'auto',
    fireModeLabel: '连发',
    fireIntervalMs: 150,
    switchOutMs: 170,
    switchInMs: 230,
    recoil: 1
  },
  pistol: {
    id: 'pistol',
    name: '手枪',
    fireMode: 'semi',
    fireModeLabel: '单发',
    fireIntervalMs: 300,
    switchOutMs: 170,
    switchInMs: 230,
    recoil: 1.35
  }
}

export const WEAPON_ORDER: readonly WeaponId[] = ['rifle', 'pistol']
export const DEFAULT_WEAPON: WeaponId = 'rifle'

export function nextWeapon(current: WeaponId): WeaponId {
  const index = WEAPON_ORDER.indexOf(current)
  return WEAPON_ORDER[(index + 1) % WEAPON_ORDER.length]
}

export function switchDuration(spec: WeaponSpec): number {
  return spec.switchOutMs + spec.switchInMs
}
