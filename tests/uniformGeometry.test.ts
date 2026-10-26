import { describe, expect, it } from 'vitest'
import {
  clampNormalizedBox,
  computeCoverTransform,
  easeBox,
  mapNormalizedPoint,
  torsoQuadFromBox
} from '@renderer/game/uniformGeometry'

describe('uniform overlay geometry', () => {
  it('clamps boxes to the video frame', () => {
    const left = clampNormalizedBox([-0.2, 0.1, 0.5, 0.5])
    expect(left[0]).toBeCloseTo(0, 10)
    expect(left[1]).toBeCloseTo(0.1, 10)
    expect(left[2]).toBeCloseTo(0.3, 10)
    expect(left[3]).toBeCloseTo(0.5, 10)

    const bottomRight = clampNormalizedBox([0.8, 0.9, 0.5, 0.5])
    expect(bottomRight[0]).toBeCloseTo(0.8, 10)
    expect(bottomRight[1]).toBeCloseTo(0.9, 10)
    expect(bottomRight[2]).toBeCloseTo(0.2, 10)
    expect(bottomRight[3]).toBeCloseTo(0.1, 10)

    const untouched = clampNormalizedBox([0.2, 0.2, 0.3, 0.4])
    expect(untouched[0]).toBeCloseTo(0.2, 10)
    expect(untouched[1]).toBeCloseTo(0.2, 10)
    expect(untouched[2]).toBeCloseTo(0.3, 10)
    expect(untouched[3]).toBeCloseTo(0.4, 10)
  })

  it('builds a tapered torso quad inside the person box', () => {
    const box: [number, number, number, number] = [0.3, 0.1, 0.4, 0.8]
    const quad = torsoQuadFromBox(box)
    expect(quad).toHaveLength(4)
    const [leftTop, rightTop, rightBottom, leftBottom] = quad
    expect(rightTop[0] - leftTop[0]).toBeGreaterThan(rightBottom[0] - leftBottom[0])
    for (const [x, y] of quad) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(box[1])
      expect(y).toBeLessThanOrEqual(box[1] + box[3])
    }
  })

  it('maps portrait video into a desktop display with cover cropping', () => {
    const transform = computeCoverTransform(720, 1280, 390, 844)
    expect(transform.height).toBeCloseTo(844, 5)
    expect(transform.width).toBeGreaterThan(390)
    expect(transform.offsetY).toBeCloseTo(0, 5)
    const [cx, cy] = mapNormalizedPoint(0.5, 0.5, transform)
    expect(cx).toBeCloseTo(195, 5)
    expect(cy).toBeCloseTo(422, 5)
  })

  it('maps landscape video without stretching it', () => {
    const transform = computeCoverTransform(1280, 720, 390, 844)
    expect(transform.width).toBeCloseTo((1280 * 844) / 720, 5)
    expect(transform.height).toBeCloseTo(844, 5)
    expect(transform.offsetX).toBeLessThan(0)
    const [cx] = mapNormalizedPoint(0.5, 0.5, transform)
    expect(cx).toBeCloseTo(195, 5)
  })

  it('returns a zero transform for invalid dimensions', () => {
    expect(computeCoverTransform(0, 720, 390, 844)).toEqual({
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0
    })
  })

  it('eases a track towards its target and clamps alpha', () => {
    const current: [number, number, number, number] = [0, 0, 1, 1]
    const target: [number, number, number, number] = [0.2, 0.2, 0.2, 0.2]
    expect(easeBox(current, target, 0)).toEqual(current)
    expect(easeBox(current, target, 1)).toEqual(target)
    expect(easeBox(current, target, 0.5)).toEqual([0.1, 0.1, 0.6, 0.6])
    expect(easeBox(current, target, 5)).toEqual(target)
  })
})
