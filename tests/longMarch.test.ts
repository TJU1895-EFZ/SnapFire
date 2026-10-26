import { describe, expect, it } from 'vitest'
import {
  INTRO_DWELL_MS,
  LONG_MARCH_BATTLES,
  LONG_MARCH_INTRO,
  dwellSecondsLeft
} from '@renderer/content/longMarch'

describe('Long March introduction', () => {
  it('requires at least ten seconds of reading', () => {
    expect(INTRO_DWELL_MS).toBeGreaterThanOrEqual(10_000)
  })

  it('formats the remaining dwell time as whole seconds, never negative', () => {
    expect(dwellSecondsLeft(INTRO_DWELL_MS)).toBe(10)
    expect(dwellSecondsLeft(9_500)).toBe(10)
    expect(dwellSecondsLeft(1)).toBe(1)
    expect(dwellSecondsLeft(0)).toBe(0)
    expect(dwellSecondsLeft(-500)).toBe(0)
  })

  it('covers background, journey, significance and contemporary value', () => {
    expect(LONG_MARCH_INTRO).toHaveLength(4)
    const text = LONG_MARCH_INTRO.map((section) => section.title).join(' ')
    expect(text).toContain('历史背景')
    expect(text).toContain('过程')
    expect(text).toContain('历史意义')
    expect(text).toContain('长征精神')
    for (const section of LONG_MARCH_INTRO) {
      expect(section.id.length).toBeGreaterThan(0)
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim().length).toBeGreaterThan(20)
      }
    }
  })
})

describe('Long March battle list', () => {
  it('lists a series of famous battles with complete metadata', () => {
    expect(LONG_MARCH_BATTLES.length).toBeGreaterThanOrEqual(6)
    for (const battle of LONG_MARCH_BATTLES) {
      expect(battle.id.length).toBeGreaterThan(0)
      expect(battle.name.length).toBeGreaterThan(1)
      expect(battle.date).toMatch(/^19\d{2}年/)
      expect(battle.place.length).toBeGreaterThan(1)
      expect(battle.summary.length).toBeGreaterThan(15)
    }
  })

  it('uses unique ids and names', () => {
    const ids = new Set(LONG_MARCH_BATTLES.map((battle) => battle.id))
    const names = new Set(LONG_MARCH_BATTLES.map((battle) => battle.name))
    expect(ids.size).toBe(LONG_MARCH_BATTLES.length)
    expect(names.size).toBe(LONG_MARCH_BATTLES.length)
  })

  it('includes the four classic crossings and the final battle', () => {
    const names = LONG_MARCH_BATTLES.map((battle) => battle.name)
    expect(names).toContain('湘江战役')
    expect(names).toContain('四渡赤水')
    expect(names).toContain('飞夺泸定桥')
    expect(names).toContain('山城堡战役')
  })
})
