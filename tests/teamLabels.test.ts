import { describe, expect, it } from 'vitest'
import { teamLabel, teamShortLabel } from '@renderer/utils/teamLabels'

describe('team labels', () => {
  it('uses the standard red/blue names in urban mode', () => {
    expect(teamLabel('red', 'urban')).toBe('红队')
    expect(teamLabel('blue', 'urban')).toBe('蓝队')
    expect(teamShortLabel('red', 'urban')).toBe('红')
    expect(teamShortLabel('blue', 'urban')).toBe('蓝')
  })

  it('maps red to the Red Army and blue to the KMT in Long March mode', () => {
    expect(teamLabel('red', 'long-march')).toBe('红军')
    expect(teamLabel('blue', 'long-march')).toBe('国民党军')
    expect(teamShortLabel('red', 'long-march')).toBe('红')
    expect(teamShortLabel('blue', 'long-march')).toBe('国')
  })
})
