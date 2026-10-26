import type { FaceResult } from '@vladmandic/human'
import { describe, expect, it } from 'vitest'
import {
  faceBoxToPersonBox,
  pickFaceForBox,
  refineTorsoBox
} from '@renderer/vision/overlayMatch'

function face(
  boxRaw: [number, number, number, number],
  boxScore = 0.8,
  embedding: number[] | null = [0.1, 0.2]
): FaceResult {
  return {
    boxRaw,
    boxScore,
    embedding
  } as unknown as FaceResult
}

describe('overlay face matching', () => {
  it('picks the most confident face inside the person box', () => {
    const insideLow = face([0.42, 0.12, 0.08, 0.1], 0.5)
    const insideHigh = face([0.45, 0.13, 0.08, 0.1], 0.9)
    const outside = face([0.85, 0.5, 0.08, 0.1], 0.99)
    const picked = pickFaceForBox([insideLow, insideHigh, outside], [0.3, 0.05, 0.4, 0.8])
    expect(picked).toBe(insideHigh)
  })

  it('ignores faces without embeddings', () => {
    const noEmbedding = face([0.45, 0.13, 0.08, 0.1], 0.99, null)
    expect(pickFaceForBox([noEmbedding], [0.3, 0.05, 0.4, 0.8])).toBeNull()
  })

  it('returns null when every face is outside the box', () => {
    const outside = face([0.05, 0.8, 0.05, 0.05])
    expect(pickFaceForBox([outside], [0.4, 0.1, 0.3, 0.6])).toBeNull()
  })

  it('derives a body box below the face for the fallback path', () => {
    const source = face([0.45, 0.2, 0.1, 0.12])
    const box = faceBoxToPersonBox(source)
    const [x, y, w, h] = box
    expect(x).toBeLessThanOrEqual(0.45)
    expect(y).toBeLessThan(0.2)
    expect(w).toBeGreaterThanOrEqual(0.12)
    expect(h).toBeGreaterThan(0.28)
    expect(y + h).toBeLessThanOrEqual(1)
  })

  it('centers the torso box under the face and inside the body box', () => {
    const source = face([0.45, 0.2, 0.1, 0.12])
    const box = refineTorsoBox([0.2, 0.1, 0.6, 0.8], source)
    expect(box[2]).toBeCloseTo(0.28, 5)
    expect(box[0] + box[2] / 2).toBeCloseTo(0.5, 5)
    expect(box[0]).toBeGreaterThanOrEqual(0.2)
    expect(box[0] + box[2]).toBeLessThanOrEqual(0.8)
  })

  it('keeps a face at the body-box edge from pushing the torso outside', () => {
    const source = face([0.21, 0.2, 0.1, 0.12])
    const box = refineTorsoBox([0.2, 0.1, 0.6, 0.8], source)
    expect(box[0]).toBeCloseTo(0.2, 5)
    expect(box[0] + box[2]).toBeLessThanOrEqual(0.8)
  })

  it('leaves the box unchanged when no face is available', () => {
    const box = refineTorsoBox([0.2, 0.1, 0.6, 0.8], null)
    expect(box[0]).toBeCloseTo(0.2, 10)
    expect(box[1]).toBeCloseTo(0.1, 10)
    expect(box[2]).toBeCloseTo(0.6, 10)
    expect(box[3]).toBeCloseTo(0.8, 10)
  })
})
