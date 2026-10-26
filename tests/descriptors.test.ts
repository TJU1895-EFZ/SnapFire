import { describe, expect, it } from 'vitest'
import {
  clothingSimilarity,
  computeTorsoCropRect,
  matchIdentity
} from '@renderer/vision/descriptors'
import { makeClothing, makeGalleryEntry } from './helpers/fixtures'

const noFace = (): number => 0

describe('computeTorsoCropRect', () => {
  it('builds a valid crop from a body box without pose keypoints', () => {
    const crop = computeTorsoCropRect(480, 720, [0.25, 0.1, 0.5, 0.8], null, null)
    expect(crop).not.toBeNull()
    if (!crop) return
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(480)
    expect(crop.y + crop.height).toBeLessThanOrEqual(720)
    expect(crop.width).toBeGreaterThan(100)
    expect(crop.height).toBeGreaterThan(200)
  })

  it('uses normalized pose keypoints when they are available', () => {
    const crop = computeTorsoCropRect(
      480,
      720,
      [0.2, 0.1, 0.6, 0.8],
      { left: [0.35, 0.2], right: [0.65, 0.2] },
      { left: [0.38, 0.55], right: [0.62, 0.55] }
    )
    expect(crop).not.toBeNull()
    if (!crop) return
    expect(crop.y).toBeGreaterThan(100)
    expect(crop.y).toBeLessThan(180)
    expect(crop.width).toBeGreaterThan(150)
    expect(crop.width).toBeLessThan(220)
  })

  it('rejects a zero-sized source or a degenerate body box', () => {
    expect(computeTorsoCropRect(0, 720, [0.2, 0.2, 0.5, 0.5], null, null)).toBeNull()
    expect(
      computeTorsoCropRect(480, 720, [0.99, 0.99, 0.02, 0.02], null, null)
    ).toBeNull()
  })
})

describe('clothingSimilarity', () => {
  it('scores an identical descriptor close to 1', () => {
    const a = makeClothing({ hue: 0.05 })
    const b = makeClothing({ hue: 0.05 })
    expect(clothingSimilarity(a, b)).toBeGreaterThan(0.98)
  })

  it('scores clearly different clothing colours much lower', () => {
    const red = makeClothing({ hue: 0.0 })
    const blue = makeClothing({ hue: 0.58 })
    expect(clothingSimilarity(red, blue)).toBeLessThan(0.5)
  })

  it('is tolerant to moderate brightness changes', () => {
    const bright = makeClothing({ hue: 0.08, value: 1 })
    const dark = makeClothing({ hue: 0.08, value: 0.55 })
    expect(clothingSimilarity(bright, dark)).toBeGreaterThan(0.85)
  })
})

describe('matchIdentity', () => {
  it('selects the player whose clothing matches', () => {
    const target = makeClothing({ hue: 0.0 })
    const gallery = [
      makeGalleryEntry('player-a-0001', 'Alice', 'red', makeClothing({ hue: 0.0 })),
      makeGalleryEntry('player-b-0002', 'Bob', 'blue', makeClothing({ hue: 0.58 }))
    ]
    const result = matchIdentity(null, target, gallery, 'self-player', noFace)
    expect(result?.playerId).toBe('player-a-0001')
    expect(result?.team).toBe('red')
    expect(result?.source).toBe('clothing')
  })

  it('never matches the local player', () => {
    const target = makeClothing({ hue: 0.0 })
    const gallery = [
      makeGalleryEntry('self-player', 'Me', 'red', makeClothing({ hue: 0.0 })),
      makeGalleryEntry('player-b-0002', 'Bob', 'blue', makeClothing({ hue: 0.58 }))
    ]
    expect(matchIdentity(null, target, gallery, 'self-player', noFace)).toBeNull()
  })

  it('returns null when two players look identical (ambiguous)', () => {
    const target = makeClothing({ hue: 0.0 })
    const gallery = [
      makeGalleryEntry('player-a-0001', 'Alice', 'red', makeClothing({ hue: 0.0 })),
      makeGalleryEntry('player-b-0002', 'Bob', 'blue', makeClothing({ hue: 0.0 }))
    ]
    expect(matchIdentity(null, target, gallery, 'self-player', noFace)).toBeNull()
  })

  it('uses the face signal when clothing is not distinctive', () => {
    const target = makeClothing({ hue: 0.3 })
    const aliceFace = new Array<number>(128).fill(0.5)
    const bobFace = new Array<number>(128).fill(0.9)
    const gallery = [
      makeGalleryEntry('player-a-0001', 'Alice', 'red', makeClothing({ hue: 0.58 }), [aliceFace]),
      makeGalleryEntry('player-b-0002', 'Bob', 'blue', makeClothing({ hue: 0.0 }), [bobFace])
    ]
    const queryFace = new Array<number>(128).fill(0.5)
    const faceSimilarity = (_query: number[], enrolled: number[]): number =>
      enrolled[0] === 0.5 ? 0.9 : 0.1
    const result = matchIdentity(queryFace, target, gallery, 'self-player', faceSimilarity)
    expect(result?.playerId).toBe('player-a-0001')
    expect(result?.source === 'face' || result?.source === 'combined').toBe(true)
  })

  it('returns null when only an unenrolled/targetless scene is available', () => {
    const target = makeClothing({ hue: 0.25 })
    expect(matchIdentity(null, target, [], 'self-player', noFace)).toBeNull()
  })
})
