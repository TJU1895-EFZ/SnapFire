import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEAPON,
  SERVER_FIRE_COOLDOWN_MS,
  WEAPONS,
  WEAPON_ORDER,
  nextWeapon,
  switchDuration
} from '@renderer/game/weapons'

describe('weapon definitions', () => {
  it('starts with the rifle', () => {
    expect(DEFAULT_WEAPON).toBe('rifle')
    expect(WEAPON_ORDER[0]).toBe(DEFAULT_WEAPON)
  })

  it('gives the rifle automatic fire and the pistol semi-automatic fire', () => {
    expect(WEAPONS.rifle.fireMode).toBe('auto')
    expect(WEAPONS.pistol.fireMode).toBe('semi')
  })

  it('never lets a weapon outrun the desktop server cooldown', () => {
    for (const id of WEAPON_ORDER) {
      const spec = WEAPONS[id]
      expect(spec.fireIntervalMs).toBeGreaterThan(SERVER_FIRE_COOLDOWN_MS)
    }
  })

  it('makes the pistol slower than the rifle', () => {
    expect(WEAPONS.pistol.fireIntervalMs).toBeGreaterThan(
      WEAPONS.rifle.fireIntervalMs
    )
  })

  it('alternates between rifle and pistol', () => {
    expect(nextWeapon('rifle')).toBe('pistol')
    expect(nextWeapon('pistol')).toBe('rifle')
  })

  it('reports a switch duration that covers lowering and raising', () => {
    for (const id of WEAPON_ORDER) {
      const spec = WEAPONS[id]
      expect(spec.switchOutMs).toBeGreaterThan(0)
      expect(spec.switchInMs).toBeGreaterThan(0)
      expect(switchDuration(spec)).toBe(spec.switchOutMs + spec.switchInMs)
    }
  })
})
